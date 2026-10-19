import { afterEach, describe, expect, it, vi } from "vitest";
import { managedMachineId, reconnectManagedMachine } from "./machineConnection";

afterEach(() => vi.restoreAllMocks());

describe("managed host reconnection", () => {
  it("identifies a managed gateway profile without accepting arbitrary endpoint paths", () => {
    expect(managedMachineId("http://127.0.0.1:5173/bridges/1234abcd")).toBe("1234abcd");
    expect(managedMachineId("http://127.0.0.1:5173/bridges/1234abcd/")).toBe("1234abcd");
    expect(managedMachineId("http://remote:8787")).toBeNull();
    expect(managedMachineId("http://localhost/bridges/1234abcd/arbitrary")).toBeNull();
    expect(managedMachineId(undefined)).toBeNull();
  });

  it("requests the typed recovery operation from the local controller", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await reconnectManagedMachine("1234abcd");
    expect(mock).toHaveBeenCalledWith("/_local/machines", expect.objectContaining({
      method: "POST", body: JSON.stringify({ action: "reconnect", id: "1234abcd" }),
    }));
  });

  it("reports a recovery failure so the UI does not pretend an empty host is live", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "SSH authentication required" }), { status: 502 }));
    await expect(reconnectManagedMachine("1234abcd")).rejects.toThrow("SSH authentication required");
  });
});
