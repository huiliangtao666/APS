import {useEffect,useRef,type ComponentPropsWithoutRef} from 'react';

/** Shared dropdown lifecycle for filters and column pickers on every page. */
export function DropdownDetails({onToggle,...props}:ComponentPropsWithoutRef<'details'>){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const element=ref.current!;
  const outside=(event:Event)=>{
   if(element.open&&event.target instanceof Node&&!element.contains(event.target))element.open=false;
  };
  const escape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||!element.open)return;
   event.preventDefault();event.stopPropagation();element.open=false;
   element.querySelector('summary')?.focus({preventScroll:true});
  };
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('focusin',outside,true);
  document.addEventListener('keydown',escape,true);
  return()=>{
   document.removeEventListener('pointerdown',outside,true);
   document.removeEventListener('focusin',outside,true);
   document.removeEventListener('keydown',escape,true);
  };
 },[]);
 return <details {...props} ref={ref} data-aps-dropdown onToggle={event=>{
  if(event.currentTarget.open){
   document.querySelectorAll<HTMLDetailsElement>('details[data-aps-dropdown][open]').forEach(other=>{
    if(other!==event.currentTarget)other.open=false;
   });
  }
  onToggle?.(event);
 }}/>;
}
