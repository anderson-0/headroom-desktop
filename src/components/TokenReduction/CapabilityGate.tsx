import type { ReactNode } from "react";

import type { Capability } from "../../lib/tokenReductionContracts";

// Renders children only when the proxy reports the required capability; otherwise
// an explicit "requires proxy" hint. Never fabricates data (NFR-G2).
export function CapabilityGate({
  capability,
  available,
  children
}: {
  capability: Capability;
  available: boolean;
  children: ReactNode;
}) {
  if (available) return <>{children}</>;
  return (
    <div className="cap-gate">
      <p className="cap-gate__msg">
        Requires a Headroom proxy that supports <code>{capability}</code>. This
        feature lights up automatically once the proxy reports it.
      </p>
    </div>
  );
}
