// Same explicit initial day insertion policy. This is only for a baseline with
// newly asserted zero execution; saved factual plans retain their own policy.
export const dayWorkspaceDefaults=(day,input)=>({timeUnit:'day',freezeDay:day,semiFreezeDay:day,strategy:'delay',scope:'full',priorityDirection:input?.urgentWorkspace?.priorityDirection||input?.urgentOrder?.priorityDirection||'数值小优先',seedTaskIds:[],events:[],exceptions:[],overtime:[]});
