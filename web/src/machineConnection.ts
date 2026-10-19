export function managedMachineId(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).pathname.match(/^\/bridges\/([a-f0-9]{8,64})\/?$/)?.[1] ?? null;
  } catch { return null; }
}

export async function reconnectManagedMachine(id: string) {
  const response = await fetch("/_local/machines", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "reconnect", id }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Open the app through the local gateway to reconnect this machine.");
  }
}
