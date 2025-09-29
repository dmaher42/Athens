export function runIdle(fn){
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(() => fn());
  }
  return setTimeout(() => fn(), 0);
}
export function runIdleChunks(steps){
  let index=0;
  const hasIdle=typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';
  const schedule=hasIdle? (cb)=>window.requestIdleCallback(cb) : (cb)=>setTimeout(cb,0);
  const now=()=> (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
  const timeBudget=()=> now()+8;
  function step(deadline){
    const limit=timeBudget();
    const hasTime=()=>{
      if (deadline && typeof deadline.timeRemaining === 'function') {
        return deadline.timeRemaining()>0;
      }
      return now()<limit;
    };
    while(index<steps.length && hasTime()){
      const fn=steps[index];
      index+=1;
      try{ fn?.(); }catch(error){ console.error('[idle] step error', error); }
    }
    if(index<steps.length){
      schedule(step);
    }
  }
  schedule(step);
}
