B16离线共享域 main 串行整合交付 r1

本次授权范围完成：源→main整合与离线域影响自测PASS。相关回归保留1项父版本已存在的FR022断言失败，整包Issue42/FR039/040/AC28/29仍NOT_READY；QA NOT_EXECUTED，P1未启用。

原delivery：dlv_32760108-fb3a-481d-be93-198c5d74fb54
event_key：dlv_32760108-fb3a-481d-be93-198c5d74fb54:r1
需求：APS-BL-001 v0.3 FR039/040、BR01、AC28/29、UAT16及适用生效CR；唯一Issue https://github.com/huiliangtao666/APS/issues/42 。

产品版本：https://github.com/huiliangtao666/APS/commit/5bdf8287778e5b0e98c33b512da4ed0f724785f7
main完整SHA：5bdf8287778e5b0e98c33b512da4ed0f724785f7
直接第一父：7fd9683291607b65e8fbf52f633fcbc9d88254e7
直接第二父/采用源：44711f94dd329a823985e1bbb90d977bdd6084ed
源直接父：b94cbe62b8e63d41434b77fcd867219bb9a85fdf
共同祖先：b8512a3853160fca8deaf374cb1c5da3ea9e771c
上游证据：d2feef7965de06f051bcd41e594c7adf7866b5ed（直接继承源；不合其证据归档到产品main）
设计SHA：null。普通push成功，GitHub API与ls-remote回读一致；工作树干净。

变更与保留

仅新增10个契约内文件：src/lib/b16-sharing.*及qa/b16-test-*。本次无文本冲突，无依赖修正；所有3385个原main文件blob保持原样，B09/B12/B15/R7、治理、原CSV、P0守卫均未覆盖。与最新main增量的源文件及递归依赖交集均为空。PM原记录34个域文件含b16-sharing.mjs本身；本次统计排除本域新增文件，并递归展开测试入口，共36个外部本地依赖，比原列表另含qa/joint-fixture.mjs、src/lib/joint-resources.mjs、src/lib/working-windows.mjs，全部blob相等；完整列表见ENVIRONMENT。

隔离验证

Linux arm64 Node22.23.2，从固定git archive构建独立Docker镜像，3395源文件哈希逐一一致；复用容器依赖并按lock核全部17个直接依赖版本，未在宿主安装、未发布或部署应用。npm run build（TypeScript、Vite、API和实际calculation Worker bundle）通过。

B16 28/28（23域+5原P0守卫）；107快照逐ID匹配源矩阵预期：13合法、92预期拒绝、Worker及来源2；独立Python Fraction/事件扫描/CSV与48归档源核验318/318。B12最终42/42、B15 30/30、R7 74/74。相关依赖回归54/55。

保留的红项：qa/joint-resources.test.mjs:67，FR022 minimal/future/MAX_LAG用例期望6任务、实际0。在直接父7fd9683291607b65e8fbf52f633fcbc9d88254e7的同镜像来源重放也为0!=6（该文件13/14）。本次该测试及全部依赖blob均未改。它是已存在的断言失败，不据此自行认定当前产品缺陷、改规则或开启修复轮次；交PM核当前生效MAX_LAG契约与历史结果，再按原FR022/Issue调度。相关失败未记PASS。

测试环境修正：B12首轮41/42中唯一失败为/fixtures/originals缺UAT17 JSON。补入前轮已核原件，24294字节、SHA2568aa1e0325c4ac77df84cadc892af94e0d94d238f290194b4eaec9342aedd98a4，最终42/42；首轮日志保留，不算产品修复。

业务断言与边界

显式同厂L01/L02适用和共享许可；全厂唯一工装/人员身份、冻结容量及不同技能组同物理池共扣；一个现有物料分配器、全计划事务、失败全回滚。162.5+162.5仅够两单，09:29拒绝/09:30合法，0.1精确1/10；G01/LP01跨线重叠拒绝、相邻合法。预计供给仍附条件，无B02持久全局预占。

自动模式仅合法候选，未执行排程搜索。仅未拆分kg/固定工时；B12批处理、额外规则族及其他单位仍GAP。P0 legacy lineScope problem保留、adoptedAsMultiLine=false；未把not_checked当PASS。没有应用src/server入口导入本域，P1不开启。

原19类CSV只读归档；kg/未拆分/零完成、BOM版本日期、时间锚点/效期、班次、供给引用、产品适用、MOLD参数均是显式可替换测试映射。原07缺产品适用表，原MOLD空参数不可直接采用；LP01原MIX/FILL、T01 MIX3、G01 FILL1保留。域JSON/Node worker_threads/mapping.csv不代表实际应用持久化、真Worker或原生19类导入导出。

剩余责任与交接

Dev后续仅按PM授权接真实多线checker、配置/导入编辑/查询汇总/排程选择、React/API/schema、真实Worker、保存比较/原生CSV/主管确认；PM核P0/R7剩余及P1启用条件，入口就绪才派QA完整UAT16。25行源收口原文和旧SHA保留，另附1行本次发现的既有断言待分类项；没有新增需求卡、关闭QA Issue Log或增加历史缺陷修复轮次。

旧B15 PASS固定19e43ef7db177d750a5eb7e8754692a7362b3332、R7 PASS固定7fd9683291607b65e8fbf52f633fcbc9d88254e7及更早证据均保留其原范围。41个既有运行服务身份/镜像/状态/启动时间未变，包括现有QA候选；本次没有启动新应用服务、占用新端口或覆盖QA数据。Test2暂停、巡检paused，不联系Design，不发布。

完整逐项预期/实际：B16-MAIN-DEV-r1-MATRIX.csv；逐FR/AC/Issue收口：B16-MAIN-DEV-r1-CLOSURE.csv；环境及源→main映射：B16-MAIN-DEV-r1-ENVIRONMENT.json；原始TAP、107输入结果、318独立核验、父版本复现、Git回读和哈希：B16-MAIN-DEV-r1-EVIDENCE.zip。

按本原event_key仅发送一次DEV_DELIVERED至APS-PM。发送/队列记录另存SEND.json；无PROCESSED回执只能记已发送待回执，不称完成闭环。
