FR022/MAX_LAG 定向契约协调与自测交付

本次任务 PASS：旧红项是缺少等待声明/配对的 fixture 与合并后启用契约失配；合法最大等待未在本次固定输入中出现漏检。仅测试变更，新增产品FAIL=0，历史修复轮次+0。Issue39整包仍 NOT_READY，完整应用/UAT责任保留，不重开归档FR022或Done #34。

原delivery/event_key：dlv_2c657fad-a63a-46ac-932e-792da41d1b03:r1
派工event_key：fr022:maxlag-contract-owner-test:20261031:r1:APS-Test
唯一执行：https://github.com/huiliangtao666/APS/issues/39；关联#40/#42。
固定受测仓库SHA：d5910cb2ac093568f5ae5b88da9bf7ec5b69af91；产品源码与基线 5bdf8287778e5b0e98c33b512da4ed0f724785f7 完全相同；设计SHA=null。
分支 test/fr022-maxlag-contract-20261031，直接父 5bdf8287778e5b0e98c33b512da4ed0f724785f7；源已普通push。仅修改 qa/joint-resources.test.mjs、新增三个 qa/fr022-maxlag-contract-* 文件。src/server/React/其他qa/package均未改。Dev仍唯一main整合owner。

批准要求与工程契约

v0.3 FR022：任务同时满足全部启用资源、完整占用至释放。BR12：工序最短停留/最大等待、冷却与存储、容量及必要上游推迟。AC14：出炉最大等10分钟，冷却晚30分钟，应调上游或明确缺口；600+600>1000禁止同时占用。UAT12候选等30非法、0合法；完整MIX/FILL/HEAT/COOL/PACK。UAT14按总投入500kg合炉、冷却合格产出480kg对400kg空间联动拆炉。条款来源为固定main docs/requirements/baselines/APS-BL-001-v0.3.json（原docx段335/509/1173/1595/1633），原文摘录、基线/生效CR原件随证据保存。

生效CR-DEC02-03只支持已授权工装/人员/共享配置增量，不修改最大等待10分钟的判定，也不批准现场默认值。CR-DEC04–06设计/mock未作应用授权。现有配对gate是实现采用边界，不能据其字面收窄v0.3整体要求。本任务只裁定原无等待声明fixture能否证明MAX_LAG通过，以及显式kg固定配对的实际行为；其他单位、非配对/一般路线等既有整包责任未因此验收或取消。

旧六项与零任务原因

旧输入 jointFixture(seed)：A-MIX、B-MIX、C-MIX各[0,30)，A-FILL、B-FILL、C-FILL各[30,60)。MOLD设2027后未生效；全部路线最大等待为空，无加工/冷却配对，也未启用MATERIAL/CAPACITY/PROGRAM/STORAGE。六项完整逐行记录见 SIX-TASKS.csv。

只开启MAX_LAG时，validateInputs返回 INPUT / PROCESS_PAIR；calculate在任何排程前整体拒绝：name=规则配置阻止计算，findings=RULE / CONFIG，message=MAX_LAG须有显式加工/冷却顺序配对，不能由client提示启用，tasks=[]、resourceReservations=[]。这六项都因全局配置拒绝未排；不是各自触发了超限，也没有可核的最大等待值。独立复核MAX_LAG为not_checked，无空任务PASS。本次直接核验返回的结构化问题；未执行浏览器UI。该finding具有table=rules/field=是否启用，但relatedRecords为空、associationGap说明缺逐条关联；本任务不声称已完成CSV物理行定位，保留Dev原#39应用诊断责任。

历史引入与原PASS

1. 原联合资源提交 a5e014ae6e646a5e5c4f4eabea8fe1b75cb21aef 期望MAX_LAG启用拒绝（0任务）。
2. 2662b2b39e5ae63b0ba3a0b0040e28c41c963337 增加通用冻结等待缺口检查，将旧断言0改6。该固定版本补齐同SHA prototypes依赖后14/14 PASS；首次抽取漏依赖的环境失败日志保留，不计产品FAIL。
3. be88f073b4c2597abcd3e5533e92f7f94a89ad59 增加显式加工/冷却gate，分支保留旧期望0，14/14 PASS。其父833b3d56929f88c9521cb64765066eece9f83879也是14/14，但不能把这两次PASS当作相同期望6的证据。
4. main合并307843d62353f84adcae6cdaa8113fc3c90969cc（父7b50db3ac09e9bf940e81ffb49ce8482e8bec02f、be88f073b4c2597abcd3e5533e92f7f94a89ad59）保留第一父的期望6测试并吸收第二父的gate；固定源复现13/14，首次定位到相同MAX_LAG红项。不是B16引入。
5. 固定main 5bdf8287778e5b0e98c33b512da4ed0f724785f7、父7fd9683291607b65e8fbf52f633fcbc9d88254e7及44711f94dd329a823985e1bbb90d977bdd6084ed均13/14。父1原受影响套件54/55独立重现；原main54/55完整历史日志与本次main13/14完整日志均保留。未重签历史PASS。

测试修正与结果

保留原minimal、future-MOLD、工具/人员/空间容量、完整释放、回滚、冻结/导出等13项正确覆盖。替换误导性的“只开MAX_LAG就得到6任务”为具名配置拒绝断言，并增加显式完整五工序逐项身份、工时、数量、等待、所有启用资源和独立复核断言。并非仅改计数或关规则。

合法fixture复用受控r4Scenario('12')的显式软件mock：工时30/30/120/60/50、240kg合格需求、0.96收率→250kg投入、COOL空间完整占240kg。新增显式HEAT工装1套与技能组1人、0–600窗口；MOLD/LABOR/MATERIAL/CAPACITY/PROGRAM/MAX_LAG/STORAGE/CALENDAR/MACHINE/PRECEDENCE全部保留。PACK50、组/工装身份与日期只为可替换测试值，未登记现场默认。完整路线实际MIX0–30、FILL30–60、HEAT90–210、COOL210–270、PACK270–320；出炉等0，冷却[180,210)停机迫使上游后移，所有独立检查pass。允许其他满足约束的合法排程，不把排列当唯一业务答案。

边界使用固定输出独立构造：COOL[210,270)，HEAT[90-w,210-w)且固定120分钟，所有HEAT设备/工装/人员账本同步该区间；FILL结束60，保持真实前序。
- w=0、10：合法；独立MAX_LAG pass。
- w=11、30：非法；实际缺口1、20，独立VERIFY / MAX_LAG和PROCESS_ROUTE问题关联冷却任务与冻结路线。
- 显式最大等待0合法且被执行；缺失/错误前序、无配对、负数/NaN、错误参数JSON/未知默认参数、缺冷却声明/重量错误、缺MATERIAL/CAPACITY/PROGRAM/STORAGE/CALENDAR共14类原子拒绝。CALENDAR缺失在freezeRunInput阶段invalid_rule_selection先拒绝；不伪造出一个已冻结PASS。
- MAX_LAG关闭/待生效/缺规则/minimal均不得当最大等待PASS。JSON保存重开后独立结论相等，仅域/计算链证据，不冒充应用保存/真Worker/UI或UAT。

固定SHA d5910cb2ac093568f5ae5b88da9bf7ec5b69af91：原受影响55项全部PASS，加新定向25项，共80/80；独立Python Fraction/区间/事件扫描149/149，25场景逐项矩阵均PASS（预期拒绝是测试PASS）。首次新增测试把缺CALENDAR误设为“先冻结后拒绝”，实际在冻结前拒绝；已修正测试层次并保存首轮24/25日志，非产品修复。未重跑已PROCESSED BR13的53/160。

环境Linux arm64、Node v22.23.2、8CPU；官方app-exec在独立短分支项目运行，零依赖安装、零预览/发布。3398受测Git文件在容器与固定源SHA256逐项相等。独立Python oracle在宿主使用标准库执行；容器未安装Python，归档重放脚本分别标明容器Node测试和宿主Python核验，首次合并脚本探测到python3缺失的环境日志保留，未安装依赖。产品树src/server/package/lock与基线git diff为空。最终fetch main仍为5bdf8287778e5b0e98c33b512da4ed0f724785f7，与测试源无并行产品改写；补丁只涉及授权测试文件。

交付与精确剩余

本测试契约任务开发DONE / 结果PASS，可交Dev串行吸收，不声明Issue39/FR022/BR12整体Done或QA UAT通过。Dev：fetch实时main，合入或cherry-pick测试源 d5910cb2ac093568f5ae5b88da9bf7ec5b69af91，记录源→main、父/交集/冲突，执行本次80项受影响检查；若main已改MAX_LAG相关源先重新分析影响。保留原#39完整输入/配置、真实UI/API/应用Worker/保存重开/原生CSV/问题定位/确认门禁与#40批位置责任。本次缺逐条CSV关联不是新开最大等待产品FAIL。
PM：核不可变原件bytes/hash与逐项矩阵，以dlv_2c657fad-a63a-46ac-932e-792da41d1b03:r1一次PROCESSED回写#39及相关原记录；不重开#34/归档FR，不新增微卡/修复轮次。QA：本任务未调度，UAT12/14整体入口由PM按既有责任核齐后再调用。Test2与巡检保持暂停，无Design联系、P1/DEC04–06/B02扩权、发布或QA环境覆盖。

直接读取APS-Dev原dlv_42026输入被平台403拒绝（Workspace token cannot act for another workspace）；未尝试替代身份。原输入引用按本次PM完整派工及Issue39/42记录核对，未将不可读取项伪称已读。此限制未阻断固定Git源码/规范/历史/实际行为复现。

证据包包含完整原红项日志、所有固定输入/规则/计划/findings/独立复核、历史差异及六个历史源快照、旧main源、测试补丁、基线/CR摘录与原件、25矩阵、149算术核验、环境/3398文件manifest和重放脚本。固定GitHub证据位置由ACCESS文件给出；独立DEV_DELIVERED一次通知PM并记录实际delivery ID。
