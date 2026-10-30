# R2.1 approved candidate integration

Combines candidate a786ee304003cfa45f2e2d60b6bf535cc328ebee (FR006 explicit availability and FR013 v1/v2 mapping fixes) with 51d4f926c1d0c43d91112aade800d211da7b3aa4 (R2.1 S1–S3 calendar/input linkage). Original continuation delivery dlv_4f268079-9879-496a-ad6b-02169b396f7c, revision c1. No main merge or publication.

Conflict resolution preserves physical pools, resource mapping transitions and no-op behavior, P06 continuous windows and exceptions, FR022 joint conditions, explicit tools availability, and the corresponding UI previews. R2.1 adds calendar checks and producer source occurrences without replacing these contracts. Both CSV batch and single-table imports now freeze original text, physical records and SHA256. Resource mapping audit csvSource and R2.1 csvSources coexist. Old snapshots remain unchanged; old versions without metadata disclose missing provenance.

Run npm test and npm run build inside an application container. Targeted integration: node --experimental-strip-types --test qa/uat-r21-integration.test.mjs qa/issue6-calendar.test.mjs qa/issue6-integrated.test.mjs qa/fr006-csv9-explicit.test.mjs qa/fr013-v1-noop.test.mjs qa/fr013-multisource.test.mjs qa/p06.test.mjs qa/p10-explicit.test.mjs . R2.1 integrated tests need controlled original UAT02 files at /inputs. The legacy v1 test requires PARENT_ROOT pointing to exact bd6f9fabe8354432e9c67b52219dc26989c2761d source with container dependencies. Browser suites use QA synthetic identity; they do not certify Portal SSO.

qa/fr013-validation* retains candidate tests; qa/fr013-r21-validation* preserves the incoming branch tests as additional coverage. FR036 static evidence retains its original version, not recertified by integration.

Known business/data dependencies remain: four original03 machines unused by stage original10 require a scope decision, and A/B split permission, demand type and order status need authoritative customer values. Test selections are explicit fixtures only. Full original-input UAT and real identity are QA/PM responsibilities. This integration does not enable DEC04–06 or close the original cards.
