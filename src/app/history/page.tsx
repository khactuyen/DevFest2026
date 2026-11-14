import { ActivityHistory } from "@/components/ActivityHistory";
import { AccessGate } from "@/components/AccessGate";

export default function HistoryPage() {
  return <AccessGate><ActivityHistory /></AccessGate>;
}
