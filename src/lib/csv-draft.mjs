// A textarea folds CR and CRLF to LF. Diff its old/new *visible* values,
// then copy every equal span from the raw source via UTF-16 boundary offsets.
// Equal spans BETWEEN corrections are not inserted text.
export function editCsvDraft(original, value) {
 const normalized = original.replace(/\r\n?/g, '\n');
 if (normalized === value) return original;
 const offsets = [0];
 for (let i = 0; i < original.length; i++) {
  if (original[i] === '\r' && original[i + 1] === '\n') i++;
  offsets.push(i + 1);
 }
 const result = [];
 const equal = (start, end) => { if (end > start) result.push(original.slice(offsets[start], offsets[end])); };
 const insert = (start, end) => { if (end > start) result.push(value.slice(start, end)); };
 // Anchor complete unchanged visible lines first. Besides reducing work for
 // large CSVs, this keeps a newly pasted newline from stealing the raw CR/LF
 // that belongs to an unchanged following line. Refine each gap by character.
 const lines = s => s.match(/[^\n]*\n|[^\n]+/g) || [];
 const oldLines = lines(normalized), newLines = lines(value);
 const boundaries = chunks => { const out = [0]; for (const chunk of chunks) out.push(out.at(-1) + chunk.length); return out; };
 const oldBounds = boundaries(oldLines), newBounds = boundaries(newLines), anchors = [];
 walk(oldLines, newLines, 0, oldLines.length, 0, newLines.length,
  (a0, a1, b0, b1) => anchors.push([oldBounds[a0], oldBounds[a1], newBounds[b0], newBounds[b1]]), () => {});
 let a0 = 0, b0 = 0;
 for (const [start, end, nextStart, nextEnd] of anchors) {
  walk(normalized, value, a0, start, b0, nextStart, equal, insert);
  equal(start, end); a0 = end; b0 = nextEnd;
 }
 walk(normalized, value, a0, normalized.length, b0, value.length, equal, insert);
 // New text is used verbatim; there is no guessed file-wide newline style.
 return result.join('');
}

function walk(a, b, a0, a1, b0, b1, equal, insert) {
  let prefix = 0;
  while (a0 + prefix < a1 && b0 + prefix < b1 && a[a0 + prefix] === b[b0 + prefix]) prefix++;
  if (prefix) equal(a0, a0 + prefix, b0, b0 + prefix); a0 += prefix; b0 += prefix;
  let suffix = 0;
  while (a1 - suffix > a0 && b1 - suffix > b0 && a[a1 - suffix - 1] === b[b1 - suffix - 1]) suffix++;
  const end = a1, nextEnd = b1; a1 -= suffix; b1 -= suffix;
  if (a0 === a1) insert(b0, b1);
  else if (b0 !== b1) {
   const split = bisect(a, a0, a1, b, b0, b1);
   if (split) {
    walk(a, b, a0, split[0], b0, split[1], equal, insert);
    walk(a, b, split[0], a1, split[1], b1, equal, insert);
   } else insert(b0, b1); // No equal characters: delete old / insert new.
  }
  if (suffix) equal(a1, end, b1, nextEnd);
}

// Bidirectional Myers shortest edit path: linear-space frontiers instead of
// an old/new character matrix or a trace for every edit distance. Ties
// consistently prefer deleting before inserting.
function bisect(a, a0, a1, b, b0, b1) {
 const n = a1 - a0, m = b1 - b0, limit = Math.ceil((n + m) / 2);
 const offset = limit + 1, size = 2 * limit + 3;
 const forward = new Int32Array(size).fill(-1), reverse = new Int32Array(size).fill(-1);
 forward[offset + 1] = reverse[offset + 1] = 0;
 const delta = n - m, odd = delta % 2 !== 0;
 let fStart = 0, fEnd = 0, rStart = 0, rEnd = 0;
 const middle = (x, y) => (x === 0 && y === 0) || (x === n && y === m) ? null : [a0 + x, b0 + y];
 for (let d = 0; d <= limit; d++) {
  for (let k = -d + fStart; k <= d - fEnd; k += 2) {
   const i = offset + k;
   let x = k === -d || (k !== d && forward[i - 1] < forward[i + 1]) ? forward[i + 1] : forward[i - 1] + 1;
   let y = x - k;
   while (x < n && y < m && a[a0 + x] === b[b0 + y]) { x++; y++; }
   forward[i] = x;
   if (x > n) fEnd += 2;
   else if (y > m) fStart += 2;
   else if (odd) {
    const j = offset + delta - k;
    if (j >= 0 && j < size && reverse[j] !== -1 && x >= n - reverse[j]) return middle(x, y);
   }
  }
  for (let k = -d + rStart; k <= d - rEnd; k += 2) {
   const i = offset + k;
   let x = k === -d || (k !== d && reverse[i - 1] < reverse[i + 1]) ? reverse[i + 1] : reverse[i - 1] + 1;
   let y = x - k;
   while (x < n && y < m && a[a1 - x - 1] === b[b1 - y - 1]) { x++; y++; }
   reverse[i] = x;
   if (x > n) rEnd += 2;
   else if (y > m) rStart += 2;
   else if (!odd) {
    const j = offset + delta - k;
    if (j >= 0 && j < size && forward[j] !== -1 && forward[j] >= n - x) return middle(forward[j], forward[j] - delta + k);
   }
  }
 }
 return null;
}
