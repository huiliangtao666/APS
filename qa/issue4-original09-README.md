# Issue4 / FR013 原09来源保真导入切片

原 delivery `dlv_4ff6e8aa-4a24-4333-afad-21e63e808505`。此工作只交付来源资料导入，不完成原09、FR013或CR-DEC04/05/06。

`originalBom` 的六列为：产品编号、物料编号、投料工序、计量基准、定额、损坏比例。模板、示例和下载名称均为 `09_物料BOM配置.csv`。示例八行与远端 main 的 v0.3 原件字节相同，来源和哈希见 `public/fr036/original09-source.json`。`09_库存批次.csv` 仍是库存标签，对应 v0.3 原13。

现行 `bom` 需要版本、生效日期、用量类型和单位，不能与六列原件视为同义模型。来源表复用现有整批预览、服务端重验、原子写入、输入版本、审计、权限、旧方案保护和查询界面，不自动产生运行 BOM。

六列必填；产品和物料引用必须存在，投料工序必须属于该产品。定额沿现有 BOM 正数行为，损坏比例沿现有 `[0,1)` 行为，用十进制文本检查，原文字面保存。不接受负数、指数、单位后缀、百分号、非有限值或空白。记录键沿现有 BOM 行身份的产品/工序/物料维度；此来源表没有生效版本，同键不能靠改基准或定额变成两条记录。整表替换保存为新输入版本；同内容重导不加版本或审计。

计量基准作为来源文本保存，不声称未知基准是合法计算策略。基准、定额分子单位、收率、损失和取整的组合校验及到现行 BOM 的运行映射仍 BLOCKED：六列原件和当前批准行为没有唯一给出缺失的版本、生效日期、用量类型、分子单位与计算组合。由 PM 向用户请求明确；解除后再按授权实现。不得用保存成功代替计算批准，不采用CR设计/mock候选值。运行快照明确列出原09未映射计算的范围。

独立测试可从交付分支取得固定 SHA。容器内执行：

```sh
node --experimental-strip-types --test qa/issue4-original09.test.mjs qa/issue4-0506.test.mjs qa/issue4-0708.test.mjs qa/issue4-0204.test.mjs qa/issue4-inventory-field-r1.test.mjs
npm test
npm run build
```

浏览器自测入口 `qa/issue4-original09-browser.mjs`，需 Playwright 1.56.1 / Chromium、Linux动态库及 `EVIDENCE_DIR`。复用 `qa/fr027-fixture.mjs` 提供隔离合成身份；页面使用真实 React/Express 产品源，非托管身份端到端验收。fixture 里的 confirmed 状态只用于测试旧输入保护，不是业务确认。证据运行时源码指纹与Git交付源码逐文件核对，报告保留环境安装失败和修正记录。

本次浏览器执行完成5组检查，模板/示例URL、DOM download属性、实际下载字节均已核对。Chromium的suggestedFilename返回`download`，没有通过原09文件名断言；最小独立HTML下载对照同样无法完成下载事件，原因尚未归属。该单项记录为BLOCKED_RUNTIME_FILENAME，需独立浏览器补证或取得可归因的复现后修复，不能把浏览器脚本执行完成理解成这一项PASS。

迁移：旧文件读入不补字段、不重写旧快照，首次导入显式增加来源集合。回退：检出父SHA重新构建；旧来源记录在JSON中保留，不删除用户数据。没有合并、发布或QA UAT签收。
