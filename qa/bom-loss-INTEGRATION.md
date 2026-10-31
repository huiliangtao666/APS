# CR-BOM-LOSS-20261031 / Issue38 — Dev 接入合同

范围：独立受控编辑组件、统一 kg 配方精确计算及冻结合同；不是主应用 API/Worker/UAT 通过。固定起点172b415122472b933fc9935b5537697ebc03ccfc。设计依据88be84f4bf4cffab76c53df5aedb331383eb32aa的change-register及Issue38最新裁决。新输入升级不改变本模块标准投入profile；Excel已含收率的产出基准必须由Dev显式区分，不能套本公式再扣一次。

## 组件与保存

```tsx
<BomLossConfig value={selectedConfig} recipe={selectedKgRecipe}
  onSave={async next => {
    // Dev: use existing authenticated/authorized save API, atomic revision check.
    // Assign authoritative new configuration version server-side, save, read back.
    // Only replace selectedConfig with the successful server response.
    const saved = await existingSaveAdapter(next);
    setSelectedConfig(saved);
  }} />
```

Props/类型见组件与bom-loss-policy.d.mts。value为已保存配置，由父级控制；组件保留未提交的文本草稿，非法值不触发onSave，也不夹紧或补0。onSave应reject失败，resolve成功；父组件用新value同步保存结果或外部选定版本。保存期间禁止重复操作，撤销回已保存value。需要只读时传disabled。父级切换配置/配方应配稳定key（例如recipeId/version），不要每次渲染重建value，以免主动重置草稿。版本/source由现有应用存储适配层提供，不让终端用户手填技术标识作为主操作。

数值输入为十进制字符串；百分比单位固定`%`（2表示2%，不是0.02）；只接受非负、有限、非指数十进制，损耗0..100闭区间；零合法。无损耗记录时明确调用createBomLossConfig(source,version)生成三项统一0。不得把已存在的非法/缺失字段自动迁移成0。overrides数组按materialId关联，每个losses可独立缺raw/production/transport。缺key继承统一值；显式字符串"0"覆盖非0统一值；清除key恢复继承。null/空串不是清除，也不是0。重复/未知物料具名拒绝。

组件不提供主应用持久化服务；qa/bom-loss-browser-entry.tsx的localStorage仅为独立自测适配器，不能部署成业务保存逻辑。配置可调用serializeBomLossConfig/parseBomLossConfig做JSON往返，均验证并复制；不写原09六列，不猜旧损坏比例含义。

## 配方与计算

BomLossRecipe显式给recipeId/version/source、unit:'kg'、basisKg、materials[{materialId,quotaKg,unit:'kg'}]。完整配方定额和必须精确等于声明基准；不完整、重复物料、单位不一致、零基准具名拒绝。每条quotaKg保留输入原值，不归一化。当前只支持同基准投入质量模型，不支持任意单位、分工序加料、新物质生成、PACK速度或尾批合并。

calculateBomLoss(recipe,config,targetKg?)产生JSON安全的精确numerator/denominator字符串；复用quantityMath，但拒绝对象绕过数值校验。Q=sum(q_i)，O=sum(q_i*(1-prod_loss_i/100))，yield=O/Q，每物料目标投入=q_i*T/O、目标产出=q_i*(1-prod_loss_i/100)*T/O。原料/运输仅保存展示，不进入生产收率、上游扣料或定额。不能与旧固定总收率再乘一次。单物料100%损耗保留零产出；全部100%时返回producible:false、O=0、yield=0；配置本身合法，可保存；任何传入目标（包括0）反算均NO_PRODUCIBLE_OUTPUT。无目标可计算/保存；T0且O>0合法。

displayBomLossExact只用于显示，最多截取6位并以…标出未完，不用于计算。Dev的物料分配适配器应直接读result.rows[].targetInput，使用quantityMath.fromExact继续精确计算，不能从显示值/Number反推。

## 运行冻结与历史兼容（Dev owner）

freezeBomLossRun(recipe,config,targetKg)验证、独立复制并递归冻结model:'bom-loss-kg-v1'、recipe、config、result；JSON序列化无BigInt，读回可从冻结recipe/config重算一致。这只覆盖本模块投影，Dev必须在现有真实run/plan中一并冻结原始输入、原09六列bytes/hash、配置版本/来源及完整证据。

Dev在现有保存schema、API、run-input、真实Worker、物料分配、原生导出及查询中接入显式模型版本选择：

- 历史无新模型标识的run/plan继续原模型与冻结输入/总收率/证据，不能读当前编辑配置重算或回填新标识。
- 新标准投入kg profile采用bom-loss-kg-v1，只派生一次收率；旧总收率若原样留存仅为来源，不参与该次计算。其他来源profile由Dev按已批准来源合同识别，禁止自动猜测/双扣收率。
- API边界再次调用验证，原子拒绝错误；source/version由真实保存版本赋值；沿既有授权/角色和并发冲突检查，不新增服务。
- Worker使用运行创建时冻结的新模型配置，与预览一致；保存后重开和导出使用冻结result/source。新增配置修改不得改变旧run/plan字节。
- Dev整合main前fetch，核父/merge-base/文件交集及quantityMath只读依赖；本交付不改原入口/DataEditor/material-allocation/bom-config/original-bom/API/schema/Worker/package。

## 可运行入口

容器内：`BOM_LOSS_OUT=/evidence node --test qa/bom-loss-selftest.mjs`；48项新范围用例。独立期望核对：`python3 qa/bom-loss-oracle.py /evidence`（Python仅处理小型JSON，可在宿主运行，不安装依赖）。

浏览器：容器中安装本repo现有依赖（不要在宿主npm安装），同时提供Playwright及匹配Chromium；`BOM_LOSS_SOURCE=$PWD BOM_LOSS_OUT=/evidence BOM_LOSS_PLAYWRIGHT=/absolute/path/to/playwright node qa/bom-loss-browser.cjs`。脚本只启动本容器环回随机端口的临时组件夹具，结束关闭；不绑定Portal、不调用主应用API。包含实际填写、覆盖/继承、显式0、非法输入、保存回调/JSON/reload、冻结后编辑和640宽度证据。首次/第二次容器Chromium资源中断保留原日志；成功运行独立记录，不记产品FAIL。

目标类型检查（容器内，限制内存）：`node --max-old-space-size=256 node_modules/typescript/lib/tsc.js --noEmit --target ES2020 --lib ES2020,DOM,DOM.Iterable --module ESNext --moduleResolution bundler --jsx react-jsx --strict --skipLibCheck src/BomLossConfig.tsx qa/bom-loss-browser-entry.tsx`。独立浏览器构建使用现有esbuild；主应用未接新入口，因此不声称整应用构建/集成通过。

## 逐项剩余责任

| 条款 | 本次结果 | 剩余及owner |
|---|---|---|
| CR三项统一0、按物料覆盖/清除、来源、边界 | 独立组件/域PASS | Dev主应用配置存储与API；PM据候选派QA新增影响 |
| CR逐物料生产损耗、加权收率、精确T反算、零产出 | 域/组件预览PASS | Dev真实物料分配/Worker只派生一次，覆盖历史兼容与导出 |
| FR003 / AC08、AC15 | 本次配置/精确计算/冻结helper PASS | Dev实际采用配置、运行存储；其他FR003基线范围保留原证据，不以此整卡通过 |
| FR010 / AC10 | 本次不改库存规则 | Dev新需求量接既有分配后补受影响检查；旧09/10/11 PASS留原SHA |
| FR011 / AC11 | 未覆盖预计供给全链 | Dev既有到达≠可用、延期、条件供给责任继续 |
| FR013 / AC26 | JSON模块往返PASS；不等原CSV/导出全链 | Dev原09六列字面保留，主应用输入/查询/导出来源及版本一致 |
| FR017 / AC15 | 模型/配置版本明确，拒绝非法参数PASS | Dev实际启用/冻结来源；不代整卡通过 |
| FR020 / AC08/10/11 | 精确逐物料需求计算PASS | Dev应用级分配/缺口/供给集成；旧场景保留 |
| AC17 | 组件内明确物料/生效来源/预览PASS | Dev任务/问题/输入联动采用本配置的来源定位 |
| AC22 | 本次未改工作流 | Dev沿#41部分方案提交/确认/退回/重交原责任 |
| #39 PACK/尾批及后续#45输入升级 | 不在本次组件实现范围 | Dev/后续授权任务；不将已澄清的业务继续写WAIT_APPROVAL |

Test2/巡检保持paused；未发布/未覆盖QA环境/未合main/未联系Design；新CR自测不增加旧产品修复轮次。QA只由PM在具体入口齐备后调度。
