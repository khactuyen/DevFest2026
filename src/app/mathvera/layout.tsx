import { MathveraApp } from "@/components/mathvera/MathveraApp";
import "./mathvera.css";

export default function MathveraLayout({ children }: { children: React.ReactNode }) {
  return <><MathveraApp initialView="home" />{children}</>;
}
