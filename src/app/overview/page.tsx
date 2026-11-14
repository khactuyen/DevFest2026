import { OverviewDashboard } from "@/components/OverviewDashboard";
import { AccessGate } from "@/components/AccessGate";

export default function Page() {
  return <AccessGate><OverviewDashboard /></AccessGate>;
}
