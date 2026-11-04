"""Exact internal v3 arithmetic adapter. No OR-Tools import or fallback.

All native variables/coefficients/linear activities are checked before emission.
Wide quantities are positional digits, never oversized IntVars or native ints.
"""
import copy
import re

BASE = 1000
MAX64 = 2**63 - 1
MAXSAFE = 2**53 - 1
INTEGER = 'aps-exact-integer:v1'
MODEL = 'aps-cpsat-workbook:v3'
CANDIDATE = 'aps-cpsat-workbook-candidate:v3'


def integer(value):
    if type(value) is int and 0 <= value <= MAXSAFE:
        return value
    if (type(value) is not dict or set(value) != {'contract', 'value'}
            or value['contract'] != INTEGER or type(value['value']) is not str
            or not re.fullmatch(r'(0|[1-9][0-9]{0,255})', value['value'])):
        raise ValueError('CP_EXACT_PROTOCOL')
    n = int(value['value'])
    if n <= MAXSAFE:
        raise ValueError('CP_EXACT_NONCANONICAL')
    return n


def wire(n):
    if type(n) is not int or n < 0 or len(str(n)) > 256:
        raise ValueError('CP_EXACT_OUTPUT')
    return n if n <= MAXSAFE else {'contract': INTEGER, 'value': str(n)}


def decode_model(data):
    if data['contract'] != MODEL or data.get('integerProtocol') != {
            'contract': INTEGER, 'base': BASE, 'maximumDecimalDigits': 256}:
        raise ValueError('CP_EXACT_VERSION')
    m = copy.deepcopy(data)
    def fields(obj, keys):
        for key in keys:
            if key in obj and obj[key] is not None:
                obj[key] = integer(obj[key])
    for s in m['scales'].values():
        fields(s, ['scale'])
    fields(m, ['weightScale'])
    for r in m['resources']:
        fields(r, ['capacity'])
    for g in m['groups']:
        fields(g, ['maxQuantity', 'fixedQuantity'])
        for r in g['routes']:
            fields(r, ['retainedQuantity'])
            fields(r['durationRatio'], ['n', 'd'])
    for t in m['tasks']:
        fields(t, ['maxQuantity'])
        for o in t['options']:
            fields(o, ['capacity', 'weightMultiplier'])
            for d in o['days']:
                d[1] = integer(d[1])
    for l in m['lots']:
        fields(l, ['quantity', 'reserved'])
    for f in m['feeds']:
        fields(f, ['maxQuantity', 'protectedQuantity'])
        if f.get('coefficient'):
            fields(f['coefficient'], ['n', 'd'])
    for d in m['demands']:
        fields(d, ['quantity', 'completedQuantity', 'protectedQuantity', 'remaining'])
    for r in m['reservations']:
        fields(r, ['amount'])
    for w in (m['metadata']['frozenUrgent'] or {}).get('wipDaily', []):
        fields(w, ['quantityScaled'])
    return m


def encode_candidate(candidate):
    if candidate is None:
        return None
    candidate['contract'] = CANDIDATE
    for collection, key in [('tasks', 'quantity'), ('groups', 'quantity'),
                            ('demands', 'scheduledQuantity'), ('allocations', 'quantity')]:
        for row in candidate[collection]:
            row[key] = wire(row[key])
    return candidate


def check64(n):
    if type(n) is not int or n < -2**63 or n > MAX64:
        raise ValueError('CP_INT64_OVERFLOW:' + str(n))
    return n


def digits(n):
    result = []
    while True:
        result.append(n % BASE)
        n //= BASE
        if n == 0:
            return result


class Relation:
    def __init__(self, expression, kind):
        self.expression, self.kind = expression, kind


class Expr:
    def __init__(self, owner, terms=None, constant=0):
        self.owner, self.terms, self.constant = owner, terms or {}, constant

    def __add__(self, other):
        other = self.owner.expr(other)
        terms = self.terms.copy()
        for i, c in other.terms.items():
            terms[i] = terms.get(i, 0) + c
            if terms[i] == 0:
                del terms[i]
        return Expr(self.owner, terms, self.constant + other.constant)

    __radd__ = __add__
    def __neg__(self):
        return self * -1
    def __sub__(self, other):
        return self + -self.owner.expr(other)
    def __rsub__(self, other):
        return self.owner.expr(other) + -self
    def __mul__(self, n):
        if type(n) is not int:
            raise ValueError('CP_EXACT_NONLINEAR')
        return Expr(self.owner, {i: c*n for i, c in self.terms.items() if c*n}, self.constant*n)
    __rmul__ = __mul__
    def __eq__(self, other):
        return Relation(self - other, 'eq')
    def __le__(self, other):
        return Relation(self - other, 'le')
    def __lt__(self, other):
        return Relation(self - other + 1, 'le')
    def __ge__(self, other):
        return Relation(self.owner.expr(other) - self, 'le')
    def __gt__(self, other):
        return Relation(self.owner.expr(other) - self + 1, 'le')
    def __bool__(self):
        raise TypeError('symbolic expression used as Python truth')
    def negated(self):
        return self.owner.literal(self).negated()


class Constraints:
    def __init__(self, constraints, owner):
        self.constraints, self.owner = constraints, owner
    def only_enforce_if(self, *flags):
        for c in self.constraints:
            c.only_enforce_if(*[self.owner.literal(f) for f in flags])
        return self


class ExactModel:
    def __init__(self, native):
        self.native = native
        self.variables = {}
        self.serial = 0
        self.linear_rows = 0
        self.max_activity = 0
        self.interval_data = {}

    def name(self, stem):
        self.serial += 1
        return stem + ':exact:' + str(self.serial)

    @property
    def proto(self):
        return self.native.proto

    def raw(self, lo, hi, name, boolean=False):
        check64(lo); check64(hi)
        if lo > hi:
            raise ValueError('CP_INTEGER_DOMAIN')
        v = self.native.new_bool_var(name) if boolean else self.native.new_int_var(lo, hi, name)
        self.variables[v.index] = (v, lo, hi)
        return v

    def expr(self, value):
        if isinstance(value, Expr):
            if value.owner is not self:
                raise ValueError('CP_EXACT_MODEL_OWNER')
            return value
        if type(value) is int:
            return Expr(self, constant=value)
        raise TypeError('CP_EXACT_EXPRESSION:' + str(type(value)))

    def bounds(self, expression):
        e = self.expr(expression)
        lo = hi = e.constant
        for i, c in e.terms.items():
            _, a, b = self.variables[i]
            lo += c*a if c >= 0 else c*b
            hi += c*b if c >= 0 else c*a
        return lo, hi

    def new_int_var(self, lo, hi, name):
        if type(lo) is not int or type(hi) is not int or lo > hi:
            raise ValueError('CP_INTEGER_DOMAIN')
        if lo != 0:
            return self.new_int_var(0, hi-lo, name) + lo
        ds = digits(hi)
        terms = {}
        for i in range(len(ds)):
            upper = ds[i] if i == len(ds)-1 else BASE-1
            terms[self.raw(0, upper, name + ':digit:' + str(i)).index] = BASE**i
        e = Expr(self, terms)
        upper = self.bounds(e)[1]
        if upper > hi:
            # Raw slack digits need no recursive upper-bound tightening:
            # x+s=hi and s>=0 establishes exactly x<=hi.
            slack = self.rectangle(upper, name + ':boundSlack')
            self.equation(e + slack - hi)
        return e + lo

    def rectangle(self, hi, name):
        ds = digits(hi)
        return Expr(self, {self.raw(0, ds[i] if i == len(ds)-1 else BASE-1,
                          name+':'+str(i)).index: BASE**i for i in range(len(ds))})

    def new_bool_var(self, name):
        v = self.raw(0, 1, name, True)
        return Expr(self, {v.index: 1})

    def literal(self, flag):
        if not isinstance(flag, Expr):
            return flag
        if flag.constant or len(flag.terms) != 1 or next(iter(flag.terms.values())) != 1:
            raise ValueError('CP_EXACT_BOOLEAN')
        i = next(iter(flag.terms))
        v, a, b = self.variables[i]
        if (a, b) != (0, 1):
            raise ValueError('CP_EXACT_BOOLEAN_DOMAIN')
        return v

    def linear(self, e):
        e = self.expr(e)
        lo, hi = self.bounds(e)
        check64(lo); check64(hi); check64(e.constant)
        for c in e.terms.values():
            check64(c)
        self.max_activity = max(self.max_activity, abs(lo), abs(hi))
        self.linear_rows += 1
        return sum(c*self.variables[i][0] for i, c in e.terms.items()) + e.constant

    def equation(self, expression):
        e = self.expr(expression)
        if not e.terms:
            return Constraints([self.native.add(e.constant == 0)], self)
        columns = []
        def add_column(k, i, c):
            while len(columns) <= k:
                columns.append({})
            columns[k][i] = columns[k].get(i, 0) + c
        for i, c in e.terms.items():
            for k, digit in enumerate(digits(abs(c))):
                if digit:
                    add_column(k, i, digit if c >= 0 else -digit)
        cs = digits(abs(e.constant))
        bound = max(abs(x) for x in self.bounds(e))
        length = max(len(columns), len(cs), len(digits(bound))) + 2
        carry = Expr(self)
        constraints = []
        for k in range(length):
            c = (cs[k] if k < len(cs) else 0) * (1 if e.constant >= 0 else -1)
            col = Expr(self, columns[k] if k < len(columns) else {}, c) + carry
            lo, hi = self.bounds(col)
            if k == length-1:
                row = col
            else:
                v = self.raw(lo//BASE, hi//BASE, self.name('carry'))
                carry = Expr(self, {v.index: 1})
                row = col - carry*BASE
            constraints.append(self.native.add(self.linear(row) == 0))
        return Constraints(constraints, self)

    def add(self, relation):
        if type(relation) is bool:
            return Constraints([self.native.add(relation)], self)
        if not isinstance(relation, Relation):
            raise TypeError('CP_EXACT_RELATION')
        e = relation.expression
        if relation.kind == 'le':
            lo, _ = self.bounds(e)
            if lo > 0:
                return Constraints([self.native.add(False)], self)
            e = e + self.new_int_var(0, -lo, self.name('inequalitySlack'))
        return self.equation(e)

    def add_bool_and(self, flags):
        return Constraints([self.native.add_bool_and([self.literal(f) for f in flags])], self)
    def add_bool_or(self, flags):
        return Constraints([self.native.add_bool_or([self.literal(f) for f in flags])], self)
    def add_implication(self, a, b):
        return Constraints([self.native.add_implication(self.literal(a), self.literal(b))], self)

    def add_division_equality(self, target, numerator, denominator):
        if type(denominator) is not int or denominator <= 0 or self.bounds(numerator)[0] < 0:
            raise ValueError('CP_EXACT_DIVISION_DOMAIN')
        r = self.new_int_var(0, denominator-1, self.name('remainder'))
        return self.add(self.expr(numerator) == self.expr(target)*denominator + r)

    def extreme(self, target, values, maximum):
        flags = []
        for value in values:
            self.add(self.expr(target) >= value if maximum else self.expr(target) <= value)
            flag = self.new_bool_var(self.name('extreme'))
            self.add(self.expr(target) == value).only_enforce_if(self.literal(flag))
            flags.append(flag)
        return self.add_bool_or(flags)
    def add_max_equality(self, target, values):
        return self.extreme(target, values, True)
    def add_min_equality(self, target, values):
        return self.extreme(target, values, False)

    def affine(self, expression):
        e = self.expr(expression)
        if len(e.terms) <= 1:
            return self.linear(e)
        lo, hi = self.bounds(e)
        v = self.raw(lo, hi, self.name('affine'))
        native = self.linear(e)
        check64(lo-hi); check64(hi-lo)
        self.native.add(v == native)
        return v

    def new_optional_interval_var(self, a, size, b, on, name):
        self.linear(self.expr(a)+size-b)
        iv = self.native.new_optional_interval_var(self.affine(a), self.affine(size), self.affine(b), self.literal(on), name)
        self.interval_data[iv.index] = (self.expr(a), self.expr(b), self.literal(on))
        return iv
    def new_fixed_size_interval_var(self, a, size, name):
        iv = self.native.new_fixed_size_interval_var(a, size, name)
        self.interval_data[iv.index] = (self.expr(a), self.expr(a+size), None)
        return iv

    def comparison(self, left, right):
        b = self.new_bool_var(self.name('compare'))
        self.add(self.expr(left) <= right).only_enforce_if(self.literal(b))
        self.add(self.expr(left) > right).only_enforce_if(b.negated())
        return self.literal(b)

    def add_cumulative(self, intervals, amounts, capacity):
        # A sum of separate limb cumulatives is not equivalent: carries depend
        # on the active set. Check the exact full sum at every interval start.
        if all(self.bounds(a)[1] <= MAXSAFE for a in amounts) and type(capacity) is int and capacity <= MAXSAFE:
            check64(sum(self.bounds(a)[1] for a in amounts))
            return self.native.add_cumulative(intervals, [self.affine(a) for a in amounts], capacity)
        for probe in intervals:
            at, _, on_probe = self.interval_data[probe.index]
            terms = []
            for iv, amount in zip(intervals, amounts):
                a, b, on = self.interval_data[iv.index]
                tests = [self.comparison(a, at), self.comparison(at+1, b)]
                if on is not None:
                    tests.append(on)
                if on_probe is not None:
                    tests.append(on_probe)
                active = self.new_bool_var(self.name('active'))
                self.add_bool_and(tests).only_enforce_if(self.literal(active))
                self.add_bool_or([x.negated() for x in tests]).only_enforce_if(active.negated())
                upper = self.bounds(amount)[1]
                value = self.new_int_var(0, upper, self.name('activeAmount'))
                self.add(value == amount).only_enforce_if(self.literal(active))
                self.add(value == 0).only_enforce_if(active.negated())
                terms.append(value)
            self.add(sum(terms) <= capacity)

    def indices(self, expression):
        return list(self.expr(expression).terms)
    def add_hint(self, expression, value):
        e = self.expr(expression)
        # Only direct canonical variable digits are hinted; hints constrain no
        # feasible assignments. All quantities use nonnegative positional form.
        for i, coefficient in e.terms.items():
            self.native.add_hint(self.variables[i][0], (value//coefficient) % BASE)
    def add_decision_strategy(self, expressions, first, choice):
        result = []
        for e in expressions:
            if isinstance(e, Expr):
                result.extend(self.variables[i][0] for i, _ in sorted(e.terms.items(), key=lambda t:-t[1]))
            else:
                result.append(e)
        return self.native.add_decision_strategy(result, first, choice)
    def get_int_var_from_proto_index(self, i):
        return self.native.get_int_var_from_proto_index(i)
    def validate(self):
        return self.native.validate()
    def value(self, solver, expression):
        if type(expression) is int:
            return expression
        if isinstance(expression, Expr):
            return expression.constant + sum(c*solver.value(self.variables[i][0]) for i, c in expression.terms.items())
        return solver.value(expression)
