export const workbookRunLabel=status=>({queued:'等待计算',running:'计算中',completed:'运行完成',partial:'部分未排',failed:'运行失败',timed_out:'计算超时（未判无解）',cancelled:'已取消'}[status]||'状态未知');
export const workbookCheckLabel=status=>({pass:'通过',problem:'问题',not_checked:'未检查'}[status]||'未检查');
