FR015 / Issue12 — 四类执行来源事件合法fresh新增/复制有限补证 r1

本次四项补证断言全部PASS；各React add/copy共八操作PASS。FR015整卡仍为PARTIAL / NOT_READY。
原109条责任断言中，旧104 PASS按原证据/原SHA继承、不重跑；本次4 NOT_EXECUTED补齐为PASS；原01责任1 PARTIAL保留。有效总计108 PASS / 1 PARTIAL / 0 NOT_EXECUTED。这是审计断言数，不是自动化测试数；八操作是四项断言的明细，不能再累加成八项卡级断言。FR014结论及其独立修复不在本任务内。

来源与基线
原delivery：dlv_03a2516f-1eb4-432a-95e9-2bb025a44274
event_key：dlv_03a2516f-1eb4-432a-95e9-2bb025a44274:r1
类型TEST_VERDICT；已有代码有限补证，产品修复0、修复后复测0，无新FR015产品缺陷。
GitHub分支feat/fr-013-016-main-batch；固定产品SHA：18c2f59761c9db69554f33a2870b68e15d092320。
需求APS-BL-001 v0.3；本卡直接生效CR为空。
设计文档SHA单列：继承原责任快照38f48f680b6368eb2f52222a8d231dfc77af2980；本次main读取快照b8bcb9b2da0e64189ab4d0ec439668093ec19d5f；handoff-policy最后修改提交54e2b993f962f87aab0d2ff02817ce6d237a1802。来信专篇fr014015-18c2f597-test-r1.md在该main无此路径，未虚构其文档SHA。按来信授权，以任务正文和已实际读取Issue12评论6489686458为当前契约依据。以上文档引用均不是产品SHA。
唯一原卡FR015：https://github.com/users/huiliangtao666/projects/2?pane=issue&itemId=PVTI_lAHOFM9WU84BpE1czhEHgto
原Issue：https://github.com/huiliangtao666/APS/issues/12
Design已处理前轮的评论：https://github.com/huiliangtao666/APS/issues/12#issuecomment-6489686458

执行与证据真实性
使用原独立GitHub clone的detached固定产品代码，只读挂入新的隔离docker；126个src/server文件重新比对固定Git blob全部一致。所有构建、React页面、Chromium、Express和有限代码检查均在容器运行。镜像sha256:0d45a31aa25c4cca1eaacbfd1ba4ee6d5028d899b329e49a6036a66fd0c35da8。源码未改，未在宿主安装依赖或启动产品。
从无事实seed开始，实际React普通数据编辑器跨表准备QA-FRESH-A/B有效正式HC40订单、MIX01/MIX02同线同工序显式设备依赖、单一合法1000kg BOM及QA-G1/G2人员组，一次真实保存200后才创建事实。没有四类业务API初始化，没有直接写business.json；business文件仅只读证据副本。fixture提供合成planner身份，非真实Gateway SSO；隔离业务存储不含在线历史，未声称真实生产执行/物料消费或人类UAT。
每次新增点击“新增一行”，每次复制实际选择第1行并点击“复制选中”，在React控件中改业务身份与相关字段后保存。JSON通过页面内“高级：原始配置文本”React输入控件填写，仍经过同一保存校验。9个写请求：1支持数据+8目标操作，全200；每次保存后独立GET和business字节证据，再刷新页面读取实际持久化身份、截图；请求/响应原文均保留。没有用重复键400或保护409替代正例。

逐项八操作
1 15-EXEC-POS-executionFacts add PASS：QA-FA→QA-FRESH-A/MIX，MIX01，0..30，部分完成20kg，显式剩余20分钟，报废0。订单需求100kg、单位kg、无前序MIX、有效正式订单、完成合格量0，匹配L01设备及显式依赖。
2 同项copy PASS：实际复制QA-FA草稿后改QA-FB、QA-FRESH-B/MIX、MIX02，重新核对全部字段，未重用同订单/工序业务身份。两事实各自设备区间不冲突。add/copy皆200、刷新持久化，旧QA-FA不变。
3 15-EXEC-POS-executionMaterials add PASS：QA-CA→QA-FA/LEAN-LOT-001/LEAN，累计20kg，引用已有事实/批次和同单位物料；每1000kg完整BOM定额1000，总收率0.96，单订单显式需求100kg对应需求104.1666…kg，20不超定额。
4 同项copy PASS：QA-CB→QA-FB/LEAN-LOT-001，另一未记账事实/批次组合20kg，不重复累计QA-FA组合；两条总40kg≤账面500−独立占用120=380kg。账面及独立占用不被重写。add/copy皆200、刷新持久化、原记录不变。
5 15-EXEC-POS-executionSources add PASS：QA-SA→QA-FA，原任务QA-FRESH-A-MIX，保留对应离线模拟订单/工序任务说明；显式映射QA-CA、LEAN-LOT-001、LEAN、20kg，来源总20kg等于分配且不超现有累计。不从名称推断批次。
6 同项copy PASS：QA-SB→QA-FB，改原任务QA-FRESH-B-MIX及其说明、重写QA-CB显式分配20kg。另一无来源事实，不只是换来源主键。两来源总40kg不再叠加到耗料；add/copy皆200、刷新持久化、原QA-SA不变。任务编号对应本fixture已有有效订单的实际MIX任务身份，不声称引用已有线上Worker历史或外部实绩。
7 15-EXEC-POS-simulationEvents add PASS：QA-EA，事件30、保护45，既有“禁止未开始任务开工”策略，合法人员缺勤QA-G1至60、显式原因。通过事实页触发两条完整executionFacts草稿（观测均30），与事件一起真实提交；不以未提交旧事实代替。服务端需处理事实[]，与无人员依赖相符。
8 同项copy PASS：复制QA-EA草稿后改QA-EB、事件40、保护55，人员QA-G2至80和独立原因；把两事实观测更新40并同批保存。事件时点非递减、单批单时点、未早于旧观测；QA-EA前缀原字节保持。无重复插单、冲突故障或伪造受影响事实。两次事件操作均200、刷新持久化。

守恒及后置核验
真实保存响应和最终GET两事实、两事实/批次组合、两来源映射均唯一；每事实20kg产出、20分钟剩余，最终观测40；订单合格完成量仍0，未把工序产出累计成订单合格量。
当前validateExecution和validateEvents均空问题；产品分配器以真实最终输入预览340kg需求，恰可全部从LEAN-LOT-001分配，剩余0，证明500−120−40=340、来源40没有再扣一次。executionInventory投影账面460，独立占用120仍保留。全部支持定义与支持数据保存后的canonical快照一致。
完整before/after历史/角色/409保护按原证据继承，未重复执行，未改签其SHA。前轮5个外部hash和更早5个外部hash复算一致，原ZIP仍ed01cd0a72b3e7f650246f7c9d2c48d3cb88fb30ea20d6dbb270212f41ee5c31。本地文件是授权可读的APS-Test本地原件/证据副本，不称共享挂载。

QA准备错误，非产品失败
attempt1支持BOM备注填“离线有限补证”，虽能保存配置，但创建耗料时触发已有不支持未明确损耗备注的保护400。保留完整请求/响应、脚本、页面和状态；随后清空备注，从无事实基底重建。这是夹具修正，无产品代码变化或修复轮次。
第二次八操作全部PASS后，runner末尾把已canonical化订单与原seed缺少空字段的对象直接deepEqual，因自动补齐“已完成合格数量”:""而退出非零。保留原results.json、run.log和失败截图，不伪写runner成功。另在同镜像运行verify.mjs，对已保存最终证据与支持数据保存后canonical快照核验，通过全部八操作、9次HTTP200、事件/唯一身份/守恒、分配器340kg；结果见verified-results.json。未重复八次页面操作。最终结论依据具体成功事务及独立后置核验，不以原runner退出码冒充整套脚本通过。

边界与最小剩余
原01五字段工厂编号/名称、产线编号/名称、时区，Design已明确R1提供责任；FR001历史Done仅单线边界，FR013/Issue4承担该类别导入契约，FR014/015仍欠相应查询关联/CRUD证明。现有标量PASS不等于实体PASS，也不是N/A；15-FACTORY-LINE保留PARTIAL，FR015整卡NOT_READY。
下一步：APS-Design按本event_key去重复核这四项由NOT_EXECUTED到PASS，回写原FR015卡、Issue12与同源清单，保留In progress；沿已有Issue明确原01类别最小交付与负责人，实施须另行授权APS-Dev，之后Test只补对应类别本卡证据。本次不实施新实体、不重复不存在入口测试，亦不为FR014失败/他卡/main/发布/全项目UAT设置FR015门槛。无新FR015缺陷编号/修复轮次；FR014-SKILL-REL01保留其独立流程，不重开D01-D03/S06。
未开始backlog、DEC04/05/06实现继续暂停；未恢复巡检、未建/改团队或路由、未main合并/发布，未代签huiliangtao666业务UAT。

交付索引
同前缀ASSERTIONS.csv：四PASS+一保留PARTIAL；OPERATIONS.csv：八操作；EFFECTIVE-FR015.csv：109项继承/本轮变更可追溯视图，不改旧CSV。EVIDENCE.zip含原始temp/fr015-fresh-execution-evidence/（attempt1失败、第二次原结果、核验脚本、各请求/响应/GET/业务只读副本、八截图、源码hash、旧hash、Issue/流程引用）；SHA256.json为外部交付hash。
完成后按handoff-policy主动发送一次TEST_VERDICT到APS-Design。发送结果另存同前缀NOTIFICATION.json，状态以实际返回记录；queued仅SENT，待PROCESSED回执，不宣称闭环，不因普通ACK再通知。
