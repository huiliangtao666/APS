// Server-created, frozen with the run conditions. Never a feasibility certificate.
export function schedulingScope(mode = 'supported', materialEnabled = false, batchEnabled = false, joint = {}) {
 if (!['supported', 'minimal-r1'].includes(mode)) throw Error('invalid_mode');
 const minimal = mode === 'minimal-r1';
 return {mode, label: minimal ? 'R1 最小模式' : '已有支持模式',
   machineAvailability: minimal ? '连续可用（不检查日历与停机）' : '工厂日历及设备停机连续窗口',
   checked: minimal ? ['单产线', '给定机器不重叠', '固定工时', '工序先后'] : ['单产线', '给定机器不重叠', '固定工时', '工序先后', '日历与停机', '已配置人员依赖', '显式预计供给可用时点',...(materialEnabled?['已声明口径的BOM需求、库存FEFO及条件供给分配']:[]),...(joint.MOLD?['显式逐生产批工装数量与完整占用/释放区间']:[]),...(joint.STORAGE?['显式逐生产批空间kg/位置容量与完整占用/释放区间']:[]),...(batchEnabled?['BOM总投入装载、均分及同产品同版本同路线同程序资源批']:[])],
   unchecked: [...(minimal ? ['日历与停机', '人员数量/技能/班次/参与时段', '预计供给可用时点'] : []), ...(minimal||!joint.MOLD?['模具与工装']:['DEC02未批准/未声明工装阶段及跨任务释放']), ...(minimal||!materialEnabled?['完整物料/BOM/库存分配']:['工序加料、完整BOM/执行耗料与任意单位换算']), ...(minimal||!batchEnabled?['设备容量与拆合批', '程序兼容']:['其他装载重量节点、跨产品兼容及分工序合批']), ...(minimal||!joint.STORAGE?['最大等待与空间']:['最大等待、动态下游释放与其他空间单位']), '换型清洗', '交付与余保', '执行事实与主管确认', '速度换算及完整精度规则'],
   note: '机器与顺序检查通过不代表完整业务可执行；未排任务不代表全局无解。独立复核仅覆盖单线、机器不重叠和工序先后。'};
}
