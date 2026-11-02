/** Pure report integration seam for the EXISTING workbook router.
 *
 * 1. Existing permission('read') / actorKey / scopeFor load an explicit dataset
 *    version. Run requests resolve ONLY snapshot(run.inputRef); never latest.
 * 2. createReportSnapshot({dataset OR frozenInput+run, datasetId,version,
 *    dayZero,scope,actor}, {read:true}) verifies frozen hashes/conditions and
 *    makes an immutable, bounded in-memory derivative. No persistence/ledger.
 * 3. readReport(snapshot, request, access) returns a <=256KiB chunk, total,
 *    unit-separated summaries, stableSort and fingerprint. UI logical pages
 *    default100, allow200/500; follow same-fingerprint nextCursor for chunks.
 *    Change conditions => discard cursor and reset page. Never reuse across runs.
 * 4. reportOptions(snapshot,query,{field:'material',category,...}) or applicable
 *    business field returns full counts plus <=100 candidates. Omitted selection
 *    is bound ALL. Use action toggle/searchAll/none/restore/reset. Search alone
 *    never changes selection. Keep the returned fingerprint with every token.
 * 5. reportDetail/queryValue use the exact query+fingerprint+recordId. Keep
 *    independent column preferences per view/detail. id is always fixed.
 *    Unknown sources have no invented link. Resolve maintenance through existing
 *    registry, preserving dataset/version and enclosing workbench state.
 * 6. Existing permission('export') calls openReportExport and streams chunks with
 *    backpressure. ALL_MATCHED is the complete filtered result, SELECTED validates
 *    IDs against it. NDJSON completion certifies bytes/hash/count; missing trailer
 *    is incomplete. CSV manifest is separate; completion appears after iteration.
 * 7. Errors carry code/status/detail. Do not turn 409/413/missing result into an
 *    empty successful table. No import, Worker, calculate, order creation or IO.
 *
 * Dates must come from selected dataset/run metadata. fromDate/toDateInclusive
 * are required; simulation 11/01..11/14 is UI sample config, not a global default.
 * capacity.daily/stops also require knownAtDate (or frozen currentDay).
 * Material category keys are exact master-data values, never guessed by SKU code.
 * Unspecified categories default ALL; to query one FG alone, set other categories
 * NONE. Default BOM expansion is false. Fields/filters are view-specific.
 *
 * 18 views are exported in VIEWS. demand.daily is a lossless product/day/unit
 * long-form matrix; UI may pivot within the same full-result query identity.
 * Minute production MODEL changes belong to Dev/the equipment CR: this module
 * preserves actual minute metadata/intervals; it cannot manufacture absent shifts,
 * day-to-minute availability/cutoff rules, daily quantity allocations or balances.
 */
export {createReportSnapshot,calendarDay,dayCalendar,calendarWindow,minuteCalendar,minuteDay,LIMITS} from './context.mjs';
export {readReport,reportOptions,reportValue,reportDetail,materialSelectionFingerprint} from './query.mjs';
export {openReportExport} from './export.mjs';
export {VIEWS} from './projections.mjs';
export {effectiveBom,expandBom,bomLeads} from './bom.mjs';
export {taskInterval,unionMinutes,intervalPeak} from './capacity.mjs';
