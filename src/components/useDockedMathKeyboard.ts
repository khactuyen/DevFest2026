"use client";

import { useEffect, useRef, useState } from "react";

export function useDockedMathKeyboard(enabled = true) {
  const keyboardHost = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLElement | null>(null);
  const disconnect = useRef<(() => void) | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => () => {
    disconnect.current?.();
    disconnect.current = null;
    fieldRef.current = null;
    setKeyboardHeight(0);
  }, [enabled]);

  function showKeyboard() {
    fieldRef.current?.focus();
    if (window.mathVirtualKeyboard?.container === keyboardHost.current)
      window.mathVirtualKeyboard.show({ animate: false });
  }

  function connectKeyboard(field: HTMLElement) {
    const host = keyboardHost.current, keyboard = window.mathVirtualKeyboard;
    if (!host || !keyboard) return;
    disconnect.current?.();
    fieldRef.current = field;
    const previous = keyboard.container;
    keyboard.hide({ animate: false });
    keyboard.container = host;
    const update = () => setKeyboardHeight(keyboard.visible ? Math.ceil(host.getBoundingClientRect().height) : 0);
    keyboard.addEventListener("geometrychange", update);
    keyboard.addEventListener("virtual-keyboard-toggle", update);
    disconnect.current = () => {
      keyboard.removeEventListener("geometrychange", update);
      keyboard.removeEventListener("virtual-keyboard-toggle", update);
      if (keyboard.container === host) {
        keyboard.hide({ animate: false });
        keyboard.container = previous;
      }
    };
    showKeyboard();
    update();
  }

  return { keyboardHost, keyboardHeight, connectKeyboard, showKeyboard };
}
