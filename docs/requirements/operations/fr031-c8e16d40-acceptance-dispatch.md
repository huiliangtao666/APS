# FR031已有交付责任验收续派

2026-10-29T16:00:52+08:00；实际delivery `dlv_64ce563e-58c9-47e1-9cb0-9d5ff85d2aec`，queued/waiting只SENT，不声称开始/通过。触发FR028结果 `dlv_8d3a7593-26f1-4bf5-aa22-ffc0939d96f4:r1` 已PROCESSED。

event_key: fr031:c8e16d40:card-responsibility-acceptance-r1
类型：已有交付本卡责任验收/有限补证；不是新功能、产品修复或应用实现。
触发：FR028结果dlv_8d3a7593-26f1-4bf5-aa22-ffc0939d96f4:r1已由Design核对22/22本卡断言并接受Done；按用户收到Test反馈可直接续派的持续授权，不等普通ACK。开始前确认GitHub本条Design结论，Test不写卡。

唯一Project #2（PVT_kwHOFM9WU84BpE1c）FR031原卡 https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHg_o 。沿原Issue14 https://github.com/huiliangtao666/APS/issues/14 归集历史；Issue14已因FR018验收closed，不重开、不创建替代卡或Issue。FR026成功恢复仍未完成，不能由本任务关闭或记N/A；FR028 Done不替代FR031验收。Issue13/3 open及Issue10/15/17 closed状态与各原责任保留。
固定产品c8e16d408b2d0207cb9886b55f39a52ebc9c1665，分支feat/fr-013-016-main-batch，父18c2f59761c9db69554f33a2870b68e15d092320。独立GitHub取源detached pin，不用Dev副本或跟随tip。先读GitHub最新baseline/current-register/受控CR两项/交接流程及FR031原卡、Issue14/13/3最新记录；需求APS-BL-001 v0.3，核定本FR直接生效CR。治理读取SHA单列，不冒充产品设计提交。公开卡页若不可读须如实披露，以受控原文/原卡映射等核对，不假称独立实时读卡。

原FR031两条（以受控原文为准）：
1 提供模拟任务进度导入、查询和编辑。更新完成量、报废量、耗料、剩余工时后显示对未完成任务和订单影响。
2 同记录重复导入不重复累计完成/扣料；状态倒退、超订单数量提示核对。不要求MES。
逐条映射AC02/12/21/23本卡实际责任：合法导入/编辑/查询、原子拒绝及行/字段/单位定位、重复幂等、正确剩余工作/物料守恒、已发生事实/当前与历史冻结保护及离线可用。共享AC不复制FR029全部异常恢复、FR026成功恢复、FR022全部物理资源协调或所有前置FR Done为本卡门槛；真实本卡必测/阻断仍须明确，不强行READY_DONE。

先继承原版本并核源码相关性，再补最小缺口，禁止重复已完成同版本同范围整组：
- 原FR031产品06895745273cde80ac681d2bb12bd388b297b04f，Test dlv_3459e128-5639-48f3-b8f4-0e08cecc038c；APS-Test/FR-031-independent-regression-report.txt / FR-031-independent-evidence.zip。原350 canonical+20 independent、完整build及FR013 CSV verifier仅认证原SHA，不整组重跑或改签。原I01守恒140=50已耗+60计划+10占用+20余量；完成/报废/合格入库语义、来源映射、单批精确耗料、重复/错误原子性、Worker冻结、源数据只读和权限证据可按相关性继承，原QA失败/修正不计产品缺陷。
- FR018/019/024固定12eed551和18c2f597执行事实/Worker/历史；FR014/015的c8e16d40与18c2f597对四执行来源/事件表fresh合法新增复制、技能关联定位；同pin FR037/FR030/FR027/FR028的权限即时撤权/本地正式SDK签名/真实确认冻结/当前事实与耗料保护，按本卡责任继承。先查各原报告/ZIP，逐组列完整source/target SHA、祖先、相关路由/依赖同异、原报告/ZIP hash；仅祖先不足以推PASS。FR028新current-facts数据与真实确认原件保护可复用，不重复其三试算场景或全权限矩阵。
- 原FR031只有React契约，重点补真实React/Express/Worker的有限本卡工作流：现有页面合法进度导入、查询、前台更正完成/报废/耗料/剩余分钟、保存/刷新/查看未完成任务及订单影响；来源聚合映射不可编辑规则与原始来源可追溯分清。准备夹具API单列，不冒充页面输入正例。一次合法重复导入/更正幂等、一次非法倒退/超量或错单位的明确行字段诊断与完整business落盘不变，应按旧证据/源码决定最小新补证，不无理由重跑全部20。
- 现阶段已支持的事实与BOM/物料/资源规则变化需用最少代表集成补新缺口，不把所有资源联合算法认证转给FR031；功能阻断与未支持范围必须诚实显示，不把“有字段”当“实际采用”。当前事实/观测变化不得让旧输入、试算、确认或历史绕过，不重复扣料；旧Worker/旧历史与新运行分开。

原UAT15原件与映射：保留原CSV b7354be8eb2dfdb2ea2b54582434b5b0c561057d4aa4746c227def78a5ab5f50（旧字段18_模拟执行进度.csv）；原250kg聚合无批准物料/批次分摊、合格/报废/设备/观测口径仍未签批。新合成样本可证明程序，不补造业务批准或声称原UAT15通过。判断它对FR031是否有本卡具体必需且未满足的断言，逐条说明；既不以泛称“全项目UAT未做”阻断，也不把具体必需项藏到N/A。原01工厂/产线实体缺口属于FR013/016等原责任，本任务不实现或代验。
FR028新观察：共用restore帮助仍写“当前缺少执行事实接口”，而当前已有版本化事实；错误沿用旧确认接口措辞。沿FR026/031原责任核对它是否误导FR031进度功能；restore409只证安全、不证成功。不要凭该文案断言“执行事实不存在”，不重开FR018-SCOPE-NOTE01，不自动派Dev或扩大恢复实现。若为本卡真实失败给最小证据、原责任/Issue、剩余动作，由Design处理。

独立一次性QA Docker运行测试/构建/浏览器/Worker，不在宿主npm install/ci/dev/start，不碰线上库。继承可用构建与正式SDK本地签名须标明相同SHA/依赖和限制。分层列程序契约、合成actor、正式SDK本地合成签名、真实平台发行签名、GatewaySSO/部署/真实成员、生产持久性、人类业务UAT；没执行NOT_EXECUTED，不以临时落盘/刷新外推生产。UAT负责人huiliangtao666，未代签。

交付逐条PASS/FAIL/PARTIAL/BLOCKED/NOT_EXECUTED矩阵、需求版本/完整SHA、源码继承/原hash及新证据路径/hash、报告/ZIP/分层/最小剩余产品动作，给READY_DONE或NOT_READY建议；有限责任验收1，产品修复0/修复后复测0，不能把验收缺口伪成产品缺陷或累计责任拆项为全项目唯一用例数。产品确缺须保留失败，不自动开发。Design决定原卡状态。
保存后单次主动TEST_VERDICT通知APS-Design，event_key为本delivery:r1，携完整SHA/矩阵/hash和下一步。queued只SENT，完成通知不等于PROCESSED；普通ACK不再触发通知。
其他未开始backlog、DEC04/05/06应用实现、原01实体实现继续暂停；巡检实际paused不恢复；无main合并/发布/团队路由/线上凭据。

