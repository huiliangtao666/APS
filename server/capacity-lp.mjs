// Nonnegative continuous production LP: maximize sum(x), A*x <= b, x >= 0.
// Bland entering/leaving order also covers zero-budget/degenerate resources.
export function solveCapacityLP(constraints,n){
 if(!Number.isInteger(n)||n<1||n>40||constraints.length>400)throw Error('产能分析规模超出范围');
 const m=constraints.length,width=n+m+1,eps=1e-9;
 const t=constraints.map((r,i)=>{
  if(r.cost.length!==n||r.cost.some(v=>!Number.isFinite(v)||v<0)||!Number.isFinite(r.budget)||r.budget<0)throw Error('产能约束数值无效');
  // Normalize rows to keep kg and natural-day budgets numerically comparable.
  const scale=Math.max(r.budget,...r.cost,1e-12),row=Array(width).fill(0);
  r.cost.forEach((v,j)=>row[j]=v/scale);row[n+i]=1;row[width-1]=r.budget/scale;return row;
 });
 const objective=Array(width).fill(0);for(let j=0;j<n;j++)objective[j]=-1;t.push(objective);
 const basis=Array.from({length:m},(_,i)=>n+i);
 for(let iteration=0;iteration<10000;iteration++){
  const enter=objective.findIndex((v,j)=>j<width-1&&v< -eps);
  if(enter<0){const quantities=Array(n).fill(0);basis.forEach((j,i)=>{if(j<n)quantities[j]=Math.max(0,t[i][width-1]);});
   for(const r of constraints){const used=r.cost.reduce((s,v,j)=>s+v*quantities[j],0);if(used>r.budget+Math.max(1e-6,r.budget*1e-7))throw Error('产能配比数值校验失败');}
   return {quantities,total:quantities.reduce((a,b)=>a+b,0)};
  }
  let leave=-1,ratio=Infinity;
  for(let i=0;i<m;i++)if(t[i][enter]>eps){const value=t[i][width-1]/t[i][enter];if(value<ratio-eps||Math.abs(value-ratio)<=eps&&(leave<0||basis[i]<basis[leave])){ratio=value;leave=i;}}
  if(leave<0)throw Error('所选物料缺少有限产能约束');
  const pivot=t[leave][enter];for(let j=0;j<width;j++)t[leave][j]/=pivot;
  for(let i=0;i<=m;i++)if(i!==leave){const f=t[i][enter];if(Math.abs(f)>1e-15)for(let j=0;j<width;j++)t[i][j]-=f*t[leave][j];}
  basis[leave]=enter;
 }
 throw Error('配比分析未收敛，请缩小物料范围');
}
export function evaluateCapacity(constraints,weights,mode='fixed'){
 const n=weights.length;if(mode==='max')return solveCapacityLP(constraints,n);
 const sum=weights.reduce((a,b)=>a+b,0);if(!(sum>0))throw Error('固定配比至少一项大于0');
 const shares=weights.map(v=>v/sum);let total=Infinity;
 for(const r of constraints){const cost=r.cost.reduce((s,v,i)=>s+v*shares[i],0);if(cost>0)total=Math.min(total,r.budget/cost);}
 if(!Number.isFinite(total))throw Error('所选配比缺少有限产能约束');
 return {total,quantities:shares.map(s=>s*total)};
}
