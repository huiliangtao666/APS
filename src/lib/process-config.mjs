const resourceTypes = new Set(['设备', '模具', '工具', '人员技能', '空间', '投料', '物料']);

/** FR-004 checks route/time/dependency configuration without assigning resource semantics. */
export function validateProcessConfig({ products = [], orders = [], routes = [], times = [], dependencies = [], machines = [], materials = [], personnelGroups = [], tools = [] }) {
  const findings = [];
  const issueFields={DEPENDENCY_ORDER:'订单编号',DEPENDENCY_OPERATION:'工序编号',DEPENDENCY_TYPE:'资源类型',PERSONNEL_COUNT:'需求数量',PERSONNEL_PHASE:'人员参与阶段',PROCESS_TIME_REFERENCE:'工序编号',PROCESS_TIME_REQUIRED:'产品编号 + 工序编号',PROCESS_TIME_DUPLICATE:'产品编号 + 工序编号',MACHINE_REQUIRED:'设备编号',MACHINE_DUPLICATE:'设备编号',ROUTE_DUPLICATE:'产品编号 + 工序编号'};
  const at=(table,index,field)=>({push(finding){
    const code=finding.code.split(' / ')[1];
    const required=code==='ROUTE_REQUIRED'?['产品编号','工序编号','工序名称'].find(f=>finding.message.includes('缺少'+f)):null;
    findings.push({...finding,table,row:index+2,field:required||issueFields[code]||field});
  }});
  const productIds = new Set(products.map(row => (row['产品编号'] || '').trim()).filter(Boolean));
  const orderIds = new Set(orders.map(row => (row['订单编号'] || '').trim()).filter(Boolean));
  const machineIds = new Set();
  const routeOperationKeys = new Set();
  const materialIds = new Set(materials.map(row => (row['物料编号'] || '').trim()).filter(Boolean));
  const personnelGroupIds = new Set(personnelGroups.map(row => (row['人员组编号'] || '').trim()).filter(Boolean));
  const routeByProduct = new Map();
  routes.forEach((row, index) => {
    const product = (row['产品编号'] || '').trim();
    const operation = (row['工序编号'] || '').trim();
    const prefix = `工艺路线第 ${index + 1} 行`;
    if (!product) at('routes',index,'工序编号').push({ code:'INPUT / ROUTE_REQUIRED', message:`${prefix}缺少产品编号` });
    if (!operation) at('routes',index,'工序编号').push({ code:'INPUT / ROUTE_REQUIRED', message:`${prefix}缺少工序编号` });
    if (operation && !(row['工序名称'] || '').trim()) at('routes',index,'工序编号').push({ code:'INPUT / ROUTE_REQUIRED', message:`${prefix}（${product}/${operation}）缺少工序名称` });
    if (product && productIds.has(product) && operation) {
      routeOperationKeys.add(`${product}\u0000${operation}`);
      const list = routeByProduct.get(product) || [];
      if (list.some(existing => (existing['工序编号'] || '').trim() === operation)) at('routes',index,'工序编号').push({ code:'INPUT / ROUTE_DUPLICATE', message:`产品 ${product} 的工序编号 ${operation} 重复` });
      else list.push(row);
      routeByProduct.set(product, list);
    }
  });
  for (const [product, list] of routeByProduct) {
    const opIds = new Set(list.map(row => (row['工序编号'] || '').trim()));
    for (const row of list) {
      const operation = row['工序编号'].trim();
      const predecessor = (row['前序工序'] || '').trim();
      if (predecessor && !opIds.has(predecessor)) at('routes',routes.indexOf(row),'前序工序').push({ code:'INPUT / ROUTE_PREDECESSOR', message:`产品 ${product} / 工序 ${operation} 引用不存在的前序工序 ${predecessor}` });
    }
    const visiting = new Set(), visited = new Set();
    const visit = id => {
      if (visiting.has(id)) { at('routes',routes.findIndex(r=>r['产品编号']===product&&r['工序编号']===id),'前序工序').push({ code:'INPUT / ROUTE_CYCLE', message:`产品 ${product} 的路线存在循环依赖，涉及工序 ${id}` }); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      const row = list.find(item => item['工序编号'].trim() === id);
      const predecessor = (row?.['前序工序'] || '').trim();
      if (predecessor && opIds.has(predecessor)) visit(predecessor);
      visiting.delete(id); visited.add(id);
    };
    for (const id of opIds) visit(id);
  }

  const timeKeys = new Set();
  times.forEach((row, index) => {
    const product = (row['产品编号'] || '').trim(), operation = (row['工序编号'] || '').trim();
    const key = `${product}\u0000${operation}`;
    if (!product || !operation) at('times',index,'固定分钟').push({ code:'INPUT / PROCESS_TIME_REQUIRED', message:`工序工时第 ${index + 1} 行缺少产品编号或工序编号` });
    else if (!productIds.has(product) || !routeOperationKeys.has(key)) at('times',index,'固定分钟').push({ code:'INPUT / PROCESS_TIME_REFERENCE', message:`工序工时第 ${index + 1} 行引用不存在的产品/工序 ${product}/${operation}` });
    if (timeKeys.has(key)) at('times',index,'固定分钟').push({ code:'INPUT / PROCESS_TIME_DUPLICATE', message:`产品 ${product} / 工序 ${operation} 工时重复` });
    timeKeys.add(key);
    const value = Number((row['固定分钟'] || '').trim());
    if (row['计算方式'] !== '固定' || !Number.isFinite(value) || value <= 0) at('times',index,'固定分钟').push({ code:'INPUT / PROCESS_TIME_INVALID', message:`产品 ${product} / 工序 ${operation} 需配置正数固定分钟；速度换算暂不支持` });
  });
  for (const [product, list] of routeByProduct) for (const row of list) {
    const operation = row['工序编号'].trim();
    if (!timeKeys.has(`${product}\u0000${operation}`)) at('routes',routes.indexOf(row),'工序编号').push({ code:'INPUT / PROCESS_TIME_MISSING', message:`产品 ${product} / 工序 ${operation} 缺少工时配置` });
  }

  machines.forEach((row, index) => {
    const id = (row['设备编号'] || '').trim();
    const operation = (row['工序编号'] || '').trim();
    const prefix = `设备资源第 ${index + 1} 行`;
    if (!id) at('machines',index,'工序编号').push({ code:'INPUT / MACHINE_REQUIRED', message:`${prefix}缺少设备编号` });
    else if (machineIds.has(id)) at('machines',index,'工序编号').push({ code:'INPUT / MACHINE_DUPLICATE', message:`设备编号 ${id} 重复` });
    else machineIds.add(id);
    if (!operation) at('machines',index,'工序编号').push({ code:'INPUT / MACHINE_OPERATION_REQUIRED', message:`${prefix}（${id || '未编号'}）缺少适用工序编号` });
    else if (![...routeOperationKeys].some(key => key.endsWith(`\u0000${operation}`))) at('machines',index,'工序编号').push({ code:'INPUT / MACHINE_OPERATION_REFERENCE', message:`${prefix}（${id || '未编号'}）适用工序 ${operation} 未出现在任何产品工艺路线中` });
  });

  dependencies.forEach((row, index) => {
    const order = (row['订单编号'] || '').trim(), operation = (row['工序编号'] || '').trim();
    const type = (row['资源类型'] || '').trim(), id = (row['资源编号'] || '').trim();
    const prefix = `工序资源依赖第 ${index + 1} 行`;
    if (!order || !orderIds.has(order)) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_ORDER', message:`${prefix}缺少有效订单编号` });
    if (!operation) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_OPERATION', message:`${prefix}缺少工序编号` });
    else {
      const orderRow = orders.find(item => (item['订单编号'] || '').trim() === order);
      const product = (orderRow?.['产品编号'] || '').trim();
      if (product && !routeByProduct.get(product)?.some(item => (item['工序编号'] || '').trim() === operation)) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_OPERATION', message:`${prefix}引用订单 ${order} 产品路线中不存在的工序 ${operation}` });
    }
    if (!resourceTypes.has(type)) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_TYPE', message:`${prefix}资源类型为空或不支持` });
    if (!id && !(type==='人员技能'&&row['候选人员组']?.trim())) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_ID', message:`${prefix}缺少资源编号` });
    if (type === '设备' && id && !machineIds.has(id)) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_REFERENCE', message:`${prefix}引用未配置的设备 ${id}` });
    // 工具/模具 share the existing 工装 master identity; original05 mapping is separate.
    if (['工具', '模具'].includes(type) && id && !tools.some(tool => tool['工装编码'] === id)) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_REFERENCE', message:`${prefix}引用未配置的工装 ${id}（${type}）` });
    if (type === '物料' && id && !materialIds.has(id)) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_REFERENCE', message:`${prefix}引用未配置的物料 ${id}` });
    if (type === '人员技能' && id && personnelGroupIds.size && !personnelGroupIds.has(id)) at('dependencies',index,'资源编号').push({ code:'INPUT / DEPENDENCY_REFERENCE', message:`${prefix}引用未配置的人员组 ${id}` });
    if (type === '人员技能') {
      const required = Number(row['需求数量'] || 0), startOffset = Number(row['人员开始偏移'] || 0), endOffset = Number(row['人员结束偏移'] || 0);
      if ((String(row['需求数量'] || '').trim() !== '' || personnelGroupIds.has(id)) && (!Number.isInteger(required) || required < 1)) at('dependencies',index,'资源编号').push({ code:'INPUT / PERSONNEL_COUNT', message:`${prefix}所需人数必须是正整数` });
      if (![startOffset, endOffset].every(Number.isFinite) || startOffset < 0 || endOffset < 0) at('dependencies',index,'资源编号').push({ code:'INPUT / PERSONNEL_PHASE', message:`${prefix}人员参与阶段偏移必须是非负分钟数` });
      if (Number.isFinite(startOffset) && Number.isFinite(endOffset) && startOffset + endOffset > 0) {
        const orderRow = orders.find(item => (item['订单编号'] || '').trim() === order);
        const product = (orderRow?.['产品编号'] || '').trim();
        const duration = Number(times.find(t => t['产品编号'] === product && t['工序编号'] === operation)?.['固定分钟']);
        if (Number.isFinite(duration) && startOffset + endOffset >= duration) at('dependencies',index,'资源编号').push({ code:'INPUT / PERSONNEL_PHASE', message:`${prefix}人员参与偏移必须短于工序工时` });
      }
    }
  });
  return findings;
}
