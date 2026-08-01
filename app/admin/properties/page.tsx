export const dynamic = "force-dynamic";
import { getAuth } from "@/lib/auth";
import { listAllAdmin } from "@/lib/services/properties";
import { formatUsd } from "@/lib/money";
import { Island, IslandBody, IslandHeader } from "@/components/ui/Island";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  createPropertyAction,
  updatePropertyAction,
} from "@/lib/actions/admin";

export default async function AdminPropertiesPage() {
  const session = await getAuth().getSession();
  const props = listAllAdmin(session!.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Featured properties</h1>
        <p className="text-sm text-white/45">
          Add and manage live deals shown on the investor dashboard.
        </p>
      </div>

      <Island>
        <IslandHeader>
          <span className="font-medium">Add property</span>
        </IslandHeader>
        <IslandBody>
          <form action={createPropertyAction} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Harbor View Residences" />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" required placeholder="Austin, TX" />
            </div>
            <div>
              <Label htmlFor="expectedApyPct">Expected APY (%)</Label>
              <Input
                id="expectedApyPct"
                name="expectedApyPct"
                type="number"
                step="0.1"
                min={0.1}
                required
                defaultValue="11"
              />
            </div>
            <div>
              <Label htmlFor="targetRaiseUsd">Target raise (USD)</Label>
              <Input
                id="targetRaiseUsd"
                name="targetRaiseUsd"
                type="number"
                min={1}
                required
                defaultValue="2500000"
              />
            </div>
            <div>
              <Label htmlFor="raisedUsd">Raised so far (USD)</Label>
              <Input
                id="raisedUsd"
                name="raisedUsd"
                type="number"
                min={0}
                defaultValue="0"
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
                defaultValue="live"
              >
                {["draft", "live", "funded", "closed"].map((s: any) => (
                  <option key={s} value={s} className="bg-[#12141c]">
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="imageUrl">Image URL (optional)</Label>
              <Input id="imageUrl" name="imageUrl" placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                required
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
                placeholder="Class A multi-family near tech corridor…"
              />
            </div>
            <input type="hidden" name="featured" value="true" />
            <div className="sm:col-span-2">
              <Button type="submit">Create featured property</Button>
            </div>
          </form>
        </IslandBody>
      </Island>

      <Island>
        <IslandHeader>
          <span className="font-medium">{props.length} properties</span>
        </IslandHeader>
        <IslandBody className="space-y-4">
          {props.length === 0 && (
            <p className="text-sm text-white/40">No properties yet.</p>
          )}
          {props.map((p: any) => (
            <div
              key={p.id}
              className="rounded-xl border border-white/8 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium">{p.name}</h2>
                  <p className="text-xs text-white/40">{p.location}</p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={p.featured ? "accent" : "neutral"}>
                    {p.featured ? "featured" : "hidden"}
                  </Badge>
                  <Badge tone="neutral">{p.status}</Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-white/55">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/45">
                <span>{(p.expectedApyBps / 100).toFixed(1)}% expected APY</span>
                <span>
                  {formatUsd(p.raisedCents)} / {formatUsd(p.targetRaiseCents)}
                </span>
              </div>

              <form
                action={updatePropertyAction}
                className="mt-4 grid gap-2 border-t border-white/8 pt-3 sm:grid-cols-4"
              >
                <input type="hidden" name="id" value={p.id} />
                <div>
                  <Label>Status</Label>
                  <select
                    name="status"
                    defaultValue={p.status}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2 text-xs"
                  >
                    {["draft", "live", "funded", "closed"].map((s: any) => (
                      <option key={s} value={s} className="bg-[#12141c]">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Featured</Label>
                  <select
                    name="featured"
                    defaultValue={p.featured ? "true" : "false"}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2 text-xs"
                  >
                    <option value="true" className="bg-[#12141c]">
                      Yes
                    </option>
                    <option value="false" className="bg-[#12141c]">
                      No
                    </option>
                  </select>
                </div>
                <div>
                  <Label>Expected APY %</Label>
                  <Input
                    name="expectedApyPct"
                    type="number"
                    step="0.1"
                    defaultValue={(p.expectedApyBps / 100).toFixed(1)}
                    className="h-10 text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" size="sm" variant="secondary" className="w-full">
                    Update
                  </Button>
                </div>
              </form>
            </div>
          ))}
        </IslandBody>
      </Island>
    </div>
  );
}
