import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldCls =
  "w-full rounded-2xl border-0 bg-tg-secondary/65 backdrop-blur-glass-sm px-4 py-3 text-[15px] text-tg-text placeholder:text-tg-hint focus:outline-none focus:ring-2 focus:ring-tg-link/40 transition";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldCls} ${props.className ?? ""}`} />;
}
