# APS-Test独立交付记录

来源：APS-Test 工作区根目录 `DEC02-03-24ba688-ROUND1-INDEPENDENT-REPORT.txt`。

原文件SHA256：`10284f61023840fb56b59ef05b7d9fdf7d9d963ab62de0abbd0a2ce140569b9f`。以下保留Test原文；不追加范围通过结论。

CR-DEC02-03 / Issue #3 — D01/D02/D03 round1 独立复测
APS-Test → APS-Design，2026-10-29，Asia/Singapore
Delivery: dlv_2c5caf14-f798-43ae-bb2f-737f33a40570
修复SHA: 24ba6884b3a5f07425a728b7733a677563c6aa44
原失败SHA: 0d2de88b70b15c555f6d005c0e4d94674e160cdf
分支: feat/fr-013-016-main-batch
代码: https://github.com/huiliangtao666/APS/commit/24ba6884b3a5f07425a728b7733a677563c6aa44

结论：D01、D02、D03三项首次修复，round1独立复测均通过。容量中断任务dlv_105360d7和恢复任务dlv_197f09db属于同一round1，不计第二轮。本结论仅关闭三项原失败的复测判断，不关闭完整CR、Issue3、全部基线或业务UAT。
原48项矩阵实际更新为25 PASS、19 PARTIAL、2 FAIL_SCOPE、2 NOT_EXECUTABLE、0 FAIL。原V01/N03由FAIL变PASS；原N06的D03误拦已修复，但该行包含尚缺原始执行资源账能力，故变PARTIAL。原U05仍PARTIAL。每行保留原失败pin结果、说明和SHA；未扩展的原覆盖边界继续保留，不把三项修复或脚本统计当48项全部通过。

一、独立来源与执行环境
独立新clone到temp/dec0203-r1-independent，fetch完整40位SHA并detached checkout。git ls-remote实际返回上述SHA，最终源码git status --porcelain为空。未使用Dev的工作树作被测源码。
已读Dev DEC02-03-Issue3-Round1-REPORT-2026-10-29.txt及其EVIDENCE ZIP，提取审阅provenance、修复浏览器原始结果和Dev重放原脚本JSON；ZIP记录的17个源码hash与独立clone全部匹配。交付恢复的同轮属性、限制、20/1结果与报告一致。Dev证据只作交叉核对，不作Test独立结果。dev-evidence-review.json记录ZIP SHA256及审阅条目。
另读原Test报告、48矩阵、independent/supplement/history脚本及原始失败JSON；原件在references保留。三份原脚本按字节原样重放，脚本内旧pin表示原脚本来源，不能作为本次被测SHA；本轮provenance.json将源码、镜像、脚本hash和新pin绑定。
独立平台app-exec --validate standalone npm ci + tsc/Vite/server/Worker生产构建通过，退出0。其余测试在独立一次性Docker应用容器中运行，只读挂载新pin源码、写隔离/evidence、临时业务库；使用已准备依赖的QA镜像，不称第二次干净依赖安装。镜像sha256:0d45a31aa25c4cca1eaacbfd1ba4ee6d5028d899b329e49a6036a66fd0c35da8。
无宿主npm/pip安装或应用启动，无在线业务库写入、发布/重启、GitHub评论/卡片修改、main合并或发送新任务。跨工作区Files API尝试返回403；Dev引用原件实际从现有宿主相邻APS-Dev目录只读取得，未绕过写权限。

二、D01 — 冻结采用范围与独立检查器：PASS
保留原失败关键断言：冻结MOLD启用、声明及生效时刻不变，删结果rules中的MOLD及全部工装账。原pin会PASS，新pin为problem。原21组中的V01通过。
新增独立场景分别有/无人员依赖；还伪造结果conditions为minimal/空选择/旧时刻，同时向检查器明确传真实冻结conditions。两种情况均problem，details既指采用标志不一致，也指出冻结声明工装账缺失。检查器继续按固定输出重建需求，没有调用Worker/调度器重排。
缺冻结data、rules、判定时刻、tools或dependencies逐项独立测试，均显式not_checked；不因结果自报元数据而假PASS。
独立按冻结规则/selection/时刻计算disabled、2099待生效、MOLD未选用、minimal-r1、精确生效瞬间五个范围。前四者无工装账且resourcePolicies为not_checked；精确生效瞬间有真实工装账且pass。实际API正常Worker和verify另由原脚本及D03场景覆盖。上述范围组合为直接freezeRunInput/calculate/独立检查器断言，未声称每种组合都逐一走了前台和API Worker。
证据：repair-independent-results.json前三组（完整冻结输入、结果、状态、details）；independent-results.json的scopeTamper/missingFrozen；原失败JSON同名证据保留。

三、D02 — 人员明确起止偏移：PASS
实际React分别清空表12第4行“人员开始偏移”和“人员结束偏移”，真实POST /api/inputs均400；前后完整business.json字节相等，包含revision与审计的持久化状态无变化。拒绝后表单空值草稿仍在，可直接修正。
两例均核对响应file=12_工序资源与物料依赖.csv、row=4、field为对应起/止字段；页面显示同文件、行、字段及“空值不按0采用”。结束偏移截图已实际查看。
每例再输入显式字符串0，真实保存200、reload读回0，GET状态同为0；随后通过真实/runs异步Worker，人员账存在且资源检查器pass。不仅依据前台输入控件读数判持久化。
独立API两字段各测空串、字段省略、空格，联合更改人员池人数7的整批全部400且完整业务字节不变。CSV preview均拒绝，无部分写入。相关Dev修复测试另包含负数、小数、非有限、超范围、运行时personnelWindows防线及无名旧窗口兼容，作为辅助回归；不将这些Dev断言全算独立新场景。
证据：repair-independent-results.json的D02三组；D02-start-draft.png、D02-end-draft.png；原脚本N03 API/UI现均PASS。无名旧窗口兼容不等于明确命名窗口可暗补0。

四、D03 — 实际采用资源的执行事实准入：PASS（原始账能力仍未闭环）
在实际React表25新增A/MIX已开始事实（开始0/观测0/完成量0/剩余30/MIX01），MOLD启用但2099才生效。保存200、刷新前台事实编号仍QA-F，GET逐字段保存正确。真实Worker完成/部分完成，冻结结果无工装账，真实API verify的resourcePolicies为not_checked。
随后用真实API清除生效时间、使MOLD当前采用；返回400，完整business字节不变。诊断精确为表25_模拟任务执行事实.csv，第2行，字段工序编号，并指明“A/MIX”“工装 QA-T（声明 QA-A）”，缺原始取得/参与起止、数量及归还/释放事实。没有把窗口重置到剩余工时，亦未删除守卫让所有组合无条件通过。
另独立validatePolicyExecution检查禁用、精确生效前一秒、精确生效瞬间、冻结未选用、minimal、无关订单工序及人员内在依赖。仅精确生效瞬间和缺原人员账报问题；LABOR关闭不能去掉人员原始事实保护。该边界组为直接冻结输入/校验，不声称全部已做UI端到端。
原始“已执行任务采用资源”的真实原始账仍未建模；正确拒绝不是这一完整CR能力已验收，也不是批准范围缩小。N06因此保留PARTIAL。
证据：repair-independent-results.json最后两组与3次真实Worker完整run/input/plan/verify；D03-future-reloaded.png；原independent-results.json的executionGuard对照。

五、相关回归、权限、历史与保护
1. 原independent.mjs由Test在新pin独立重放：21组20 PASS / 1 FAIL，FAIL仍为S06候选分配。Dev报告的同样20/1已核对，但不冒充Test独立结果；本次是Test自己运行。收集器退出0不代表全绿。
2. 新增repair-independent.mjs：8组8 PASS，complete=true，无browserSetupError或browserErrors。原脚本有10次真实Worker，独立history脚本2次，新脚本3次；次数仅说明实际执行，不累计为15项独立业务验收。
3. 原supplement.mjs不改断言重放：8组6 PASS / 2 FAIL。一项是P08-P09独立同技能岗位范围缺口，继续保留FAIL_SCOPE。另一项N06旧复现脚本先要求“保存前后字节不变”、随后才断言应200；修复后成功保存会更新事实/revision，因此先触发其旧失败状态断言。该日志原样保留，不误报为D03未修复；D03的新UI/API/Worker成功及活动拒绝证据如上。原脚本仍证明端点重叠、生产批身份、无幽灵账、disabled/future/minimal、CSV与审计相关回归。
4. 原脚本实际权限中间件验证query/非成员403、伪造actor/role无效、陈旧revision409且字节不变；planner提交、supervisor确认。QA身份为合成成员+真实角色中间件，浏览器用runtime alias；不称Portal签名身份/SSO全验，无身份QA默认planner的限制继续保留。
5. 草稿历史和确认历史独立断言通过；history-results.json保存原方案、确认、plan inputs、run inputs完整对象与散列。当前配置改变并新Worker后旧对象全量相等；不只比较摘要或结果任务数量。
6. 按变更相关性独立容器执行71/71相关测试通过：6项Dev修复、8项原政策、RAW01、FR014015、confirmation、FR036契约、condition-trials、resource-load。它们是辅助回归，和独立场景有交叠，不累计为新的48矩阵通过数。本轮没有借用Dev的140项等宣称自己全跑。
7. Test从git原失败树取字节，重新逐件核对34个FR016/RAW01/CsvBatchPanel/csv-draft原保护文件：34/34与原失败pin字节相等，且全部匹配原Test manifest SHA256。保护成功不重认证旧FR016验收，不追写旧pin通过，不累计RAW01修复轮次。旧全树证书曾因合法FR036矩阵变化不适用，本轮没有把重跑那类旧证书作为新修复前提。
8. 本轮新脚本第一版拿未标准化fact对象与服务端标准化对象全量相等比较，因基线自动补两个合法空列而停在D03；保留diagnostics初次日志。仅修正测试为核对所提交字段，并补成真实UI录入；没有修改产品。最终8组全部重新运行通过，不将这次测试夹具修正算产品缺陷或第二轮。

六、未闭环范围与本轮边界
候选联合分配仍输入顺序相关：A池技能A、B池技能B、A→B替代，B后A会误缺员而反序成功；当前产品API仍要求显式单组，不能表达候选集合，不能包装成合法前台候选输入造成Worker假缺员。
同池独立同技能岗位缺身份，阶段按同角色max不能表示独立岗位人数相加；P08仍FAIL_SCOPE。跨组同物理池与同池多班/相邻交班无规范表达，P06/P10仍NOT_EXECUTABLE。原始执行资源账、单工装不连续多窗口、其余PARTIAL中的UI/组合/迁移/真正计算中竞态限制均未因本轮自动关闭。
DEC04/05/06属于后续设计/mock审查，未阻塞本修复复测。本轮未执行这些设计任务；没有产品代码的设计不得称产品验收。

七、复现命令与交付
工作区根目录：
git clone --no-checkout https://github.com/huiliangtao666/APS.git temp/dec0203-r1-independent
git -C temp/dec0203-r1-independent fetch origin 24ba6884b3a5f07425a728b7733a677563c6aa44
git -C temp/dec0203-r1-independent checkout --detach 24ba6884b3a5f07425a728b7733a677563c6aa44
git -C temp/dec0203-r1-independent ls-remote origin refs/heads/feat/fr-013-016-main-batch
.codex/skills/workspace-app-builder/scripts/app-exec.sh --validate --mode standalone --cwd /workspace/temp/dec0203-r1-independent --timeout-ms 240000 'npm ci && npm run build'
bash temp/dec0203-r1-evidence/run-independent.sh
bash temp/dec0203-r1-evidence/run-supplement.sh
bash temp/dec0203-r1-evidence/run-history.sh
bash temp/dec0203-r1-evidence/run-repair-independent.sh
相关71项的完整Docker命令在related-tests-command.txt。解压证据放temp/dec0203-r1-evidence，新clone放temp/dec0203-r1-independent；使用准备好的同镜像，保持源码只读；不得覆盖在线产品源码或业务数据。

报告：DEC02-03-24ba688-ROUND1-INDEPENDENT-REPORT.txt
原48项更新：DEC02-03-24ba688-ROUND1-INDEPENDENT-48-RESULTS.csv
证据包：DEC02-03-24ba688-ROUND1-INDEPENDENT-EVIDENCE.zip
交付散列：DEC02-03-24ba688-ROUND1-INDEPENDENT-SHA256.json
