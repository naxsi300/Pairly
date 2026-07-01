# Wishlist Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Surface the existing `ARCHIVED` wishlist status in the UI as a one-way soft-archive, plus an `?include_archived` query param on the list endpoint.

**Architecture:** Backend: add optional `include_archived: bool = False` to `GET /api/wishlist`. Frontend: archive action + confirm modal on OPEN/PLANNED/DONE items; an expandable "Архив" section at the bottom showing archived items read-only; the list call fetches `?include_archived=1` and client-filters.

**Tech Stack:** FastAPI + SQLAlchemy2 (backend), React+TS+Vite (miniapp), vitest + pytest.

## Global Constraints
- Archive is **one-way** (backend `ARCHIVED` is terminal). No restore.
- Archive allowed from OPEN / PLANNED / DONE; NOT from PENDING (must approve first).
- Russian copy; new keys in `miniapp/src/copy.ts` under `wishlist`.
- Colors via `var(--tg-*)`. Reuse existing `.card-act ghost`/`.card-act danger` + Modal.
- Cap counts non-archived (already does — no cap change).
- TDD; frequent commits. Run backend tests from `backend/`, frontend from `miniapp/`.

---

### Task 1: Backend — `include_archived` query param

**Files:**
- Modify: `backend/pairly/api/app.py:324-336`
- Test: `backend/tests/test_wishlist.py` (or create `test_wishlist_archive.py`)

**Interfaces:** `GET /api/wishlist?include_archived=1` → list including archived items.

- [ ] **Step 1: Write failing test**

In `backend/tests/test_wishlist_archive.py` (read an existing wishlist test for the client fixture pattern):

```python
async def test_archive_query_param_returns_archived_items(client, pair_factory, auth_headers):
    pair, h = await pair_factory(), auth_headers()
    # create + archive one item via the status endpoint
    create = await client.post("/api/wishlist", json={"title": "test", "status": "open"}, headers=h)
    item_id = create.json()["id"]
    await client.post(f"/api/wishlist/{item_id}/status", json={"status": "archived"}, headers=h)
    # default excludes archived
    r1 = await client.get("/api/wishlist", headers=h)
    assert all(i["status"] != "archived" for i in r1.json())
    # include_archived=1 returns it
    r2 = await client.get("/api/wishlist?include_archived=1", headers=h)
    assert any(i["status"] == "archived" and i["id"] == item_id for i in r2.json())
```

(Adapt the fixture/helper names to what the existing wishlist tests use — read `test_wishlist.py` first.)

- [ ] **Step 2: Run test → FAIL**

Run: `cd backend && uv run pytest tests/test_wishlist_archive.py -q`
Expected: FAIL — `?include_archived` ignored (archived still excluded).

- [ ] **Step 3: Implement**

In `backend/pairly/api/app.py`, change the handler:

```python
    @app.get("/api/wishlist", response_model=list[WishlistItemOut])
    async def get_wishlist(
        include_archived: bool = False,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[WishlistItemOut]:
        pair_id = _require_pair(auth)
        items = await wishlist.list_items(
            session, pair_id=pair_id, user_id=auth.user.id, include_archived=include_archived
        )
        out = []
        for i in items:
            o = WishlistItemOut.model_validate(i)
            o.mine = i.created_by == auth.user.id
            out.append(o)
        return out
```

- [ ] **Step 4: Run test → PASS**

Run: `cd backend && uv run pytest tests/test_wishlist_archive.py -q`
Expected: PASS.

- [ ] **Step 5: Run full backend wishlist suite + ruff**

Run: `cd backend && uv run pytest tests/test_wishlist.py tests/test_wishlist_archive.py -q && uv run ruff check pairly/api/app.py`
Expected: all pass, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add backend/pairly/api/app.py backend/tests/test_wishlist_archive.py
git commit -m "feat(api): GET /api/wishlist supports ?include_archived=1"
```

---

### Task 2: Frontend — copy + listWishlist uses include_archived

**Files:**
- Modify: `miniapp/src/copy.ts`, `miniapp/src/sdk/api.ts`

**Interfaces:** `endpoints.listWishlist(signal, includeArchived?)` → adds `?include_archived=1` when true.

- [ ] **Step 1: Add copy keys**

In `miniapp/src/copy.ts`, inside `wishlist: { ... }` (add near `repeat`):

```typescript
    archiveAction: "В архив",
    archiveConfirm: (title: string) => `Убрать «${title}» в архив? Останется в архиве, но не будет мешаться.`,
    archiveSubmit: "В архив",
    archivedLabel: "в архиве",
    archiveSectionClosed: (n: number) => `Архив · ${n}`,
    archiveSectionOpen: "Архив",
    archiveEmpty: "В архиве пусто.",
```

- [ ] **Step 2: Update listWishlist endpoint**

In `miniapp/src/sdk/api.ts` (~line 198):

```typescript
  listWishlist: (signal?: AbortSignal, includeArchived?: boolean) =>
    request<WishlistItem[]>(
      `/api/wishlist${includeArchived ? "?include_archived=1" : ""}`,
      { signal },
    ),
```

- [ ] **Step 3: Build**

Run: `cd miniapp && npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/copy.ts miniapp/src/sdk/api.ts
git commit -m "feat(wishlist): archive copy + listWishlist(includeArchived)"
```

---

### Task 3: Frontend — archive action + confirm modal

**Files:**
- Modify: `miniapp/src/screens/Wishlist.tsx`
- Test: `miniapp/src/screens/Wishlist.test.tsx`

**Interfaces:** new `archive(item)` handler → `endpoints.setWishlistStatus(item.id, "archived")` (optimistic); a confirm Modal.

- [ ] **Step 1: Write failing test**

In `Wishlist.test.tsx` (read existing tests for the listMock pattern):

```typescript
it("archives an open item via confirm modal", async () => {
  listMock.mockResolvedValue([{ id: "w1", title: "Пицца", status: "open", mine: true, /* …fields */ } as any]);
  render(<Wishlist />);
  // open item shows the archive action
  fireEvent.click(await screen.findByText(/В архив/));
  // confirm modal
  fireEvent.click(await screen.findByRole("button", { name: /В архив$/ }));
  await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith("w1", "archived", expect.anything()));
});
```

(Match the mock setup + field shape used by existing Wishlist tests.)

- [ ] **Step 2: Run test → FAIL**

Run: `cd miniapp && npx vitest run src/screens/Wishlist.test.tsx -t "archives"`
Expected: FAIL — no "В архив" action rendered.

- [ ] **Step 3: Implement**

In `Wishlist.tsx`:
- Add `const [confirmingArchive, setConfirmingArchive] = useState<WishlistItem | null>(null);`
- Add handler:

```typescript
  async function archive(item: WishlistItem) {
    setData((prev) => (prev ?? []).map((w) => (w.id === item.id ? { ...w, status: "archived" } : w)));
    try {
      await endpoints.setWishlistStatus(item.id, "archived");
    } catch {
      refetch();
    }
  }
```

- In the item action row (the block around line 282-309), add an archive button for OPEN/PLANNED/DONE (not pending, not done-done — done already has repeat+delete; add archive there too since backend allows DONE→ARCHIVED). Simplest: show `📦 В архив` ghost button on every non-pending item:

```jsx
{item.status !== "pending" ? (
  <button type="button" className="card-act ghost" onClick={() => setConfirmingArchive(item)}>
    📦 {COPY.wishlist.archiveAction}
  </button>
) : null}
```

- Add the confirm Modal (mirror the existing `confirmingDelete` Modal):

```jsx
<Modal
  open={confirmingArchive !== null}
  title={confirmingArchive ? COPY.wishlist.archiveConfirm(confirmingArchive.title) : ""}
  onClose={() => setConfirmingArchive(null)}
  onSubmit={() => { if (confirmingArchive) archive(confirmingArchive); setConfirmingArchive(null); }}
  submitLabel={COPY.wishlist.archiveSubmit}
>
  <p className="text-sm" style={{ color: "var(--tg-hint)" }}>
    {COPY.wishlist.archivedLabel}
  </p>
</Modal>
```

- [ ] **Step 4: Run test → PASS**

Run: `cd miniapp && npx vitest run src/screens/Wishlist.test.tsx -t "archives"`
Expected: PASS.

- [ ] **Step 5: Run full Wishlist suite + build**

Run: `cd miniapp && npx vitest run src/screens/Wishlist.test.tsx && npm run build`
Expected: PASS + build OK.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/screens/Wishlist.tsx miniapp/src/screens/Wishlist.test.tsx
git commit -m "feat(wishlist): archive action + confirm modal"
```

---

### Task 4: Frontend — "Архив" section (collapsed, read-only)

**Files:**
- Modify: `miniapp/src/screens/Wishlist.tsx`
- Test: `miniapp/src/screens/Wishlist.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Wire includeArchived into the list call**

The screen calls `endpoints.listWishlist()` via `useApi`. Change it to pass `true`:

```typescript
const { data, loading, error, refetch, setData } = useApi<WishlistItem[]>(
  (signal) => endpoints.listWishlist(signal, true)
);
```

(Confirm `useApi` accepts a function-of-signal; if it takes an endpoint ref, adapt — read `useApi` usage in the file.)

- [ ] **Step 2: Add the section state + render**

```typescript
const [archiveOpen, setArchiveOpen] = useState(false);
const archivedItems = items.filter((i) => i.status === "archived");
const activeItems = items.filter((i) => i.status !== "done" && i.status !== "archived"); // existing, unchanged
```

Below the main list (and below doneItems), render:

```jsx
{archivedItems.length > 0 || archiveOpen ? (
  <div style={{ marginTop: 16 }}>
    <button
      type="button"
      className="section-label"
      style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: "none", padding: "8px 0" }}
      onClick={() => setArchiveOpen((v) => !v)}
      aria-expanded={archiveOpen}
    >
      {archiveOpen ? COPY.wishlist.archiveSectionOpen : COPY.wishlist.archiveSectionClosed(archivedItems.length)} {archiveOpen ? "▾" : "▸"}
    </button>
    {archiveOpen ? (
      archivedItems.length === 0 ? (
        <p className="card-sub">{COPY.wishlist.archiveEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {archivedItems.map((item) => (
            <li key={item.id}>
              <div style={{ ...warmWash, opacity: 0.5, padding: "12px 14px" }}>
                <div className="card-title">{item.title}</div>
                <div className="meta">{COPY.wishlist.archivedLabel}</div>
              </div>
            </li>
          ))}
        </ul>
      )
    ) : null}
  </div>
) : null}
```

(Adapt `warmWash` to the actual surface style constant used in the file.)

- [ ] **Step 3: Write test for the section**

```typescript
it("shows the Архив section collapsed with count, expands on tap", async () => {
  listMock.mockResolvedValue([
    { id: "w1", title: "Пицца", status: "open", mine: true } as any,
    { id: "w2", title: "Старое", status: "archived", mine: true } as any,
  ]);
  render(<Wishlist />);
  // collapsed header shows the count
  const header = await screen.findByText(/Архив · 1/);
  expect(screen.queryByText("Старое")).not.toBeInTheDocument();
  fireEvent.click(header);
  expect(await screen.findByText("Старое")).toBeInTheDocument();
});
```

- [ ] **Step 4: Run test → PASS; run full Wishlist suite + build**

Run: `cd miniapp && npx vitest run src/screens/Wishlist.test.tsx && npm run build`
Expected: PASS + build OK.

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/screens/Wishlist.tsx miniapp/src/screens/Wishlist.test.tsx
git commit -m "feat(wishlist): collapsed read-only Архив section"
```

---

### Task 5: Full build, test, deploy

- [ ] **Step 1: Full backend + frontend suites**

```bash
cd backend && uv run pytest -q
cd ../miniapp && npx vitest run && npm run build
```
Expected: all green.

- [ ] **Step 2: Push + deploy**

```bash
cd ..
git push origin main
ssh hiplet-97620 'cd /opt/pairly && git pull --ff-only && nohup bash deploy/scripts/deploy.sh > /tmp/dep-wl.log 2>&1 &'
```

- [ ] **Step 3: Verify** — health ok; live bundle contains `В архив` copy.

---

## Self-Review
- **Spec coverage**: backend param (T1), copy+endpoint (T2), archive action+confirm (T3), archive section (T4). One-way, no restore, no PENDING archive — all covered.
- **Type consistency**: `listWishlist(signal, includeArchived?)`; `setWishlistStatus(id, status)` unchanged.
- **Cap**: unchanged (repo already excludes archived from cap).
