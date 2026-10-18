"use strict";

const mockQuery = jest.fn();

jest.mock("../src/db/pool", () => ({
  query: (...args) => mockQuery(...args),
}));

const {
  saveDraft,
  getDrafts,
  getDraft,
  deleteDraft,
  deleteExpiredDrafts,
} = require("../src/services/jobDraftService");

describe("jobDraftService", () => {
  beforeEach(() => mockQuery.mockReset());

  it("uses one ownership-safe upsert for an existing draft", async () => {
    const draft = { id: "draft-1", client_address: "GCLIENT", title: "Updated" };
    mockQuery.mockResolvedValue({ rows: [draft] });

    await expect(saveDraft("GCLIENT", {
      id: "draft-1",
      title: "Updated",
      description: "Description",
    })).resolves.toEqual(draft);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [query, values] = mockQuery.mock.calls[0];
    expect(query).toContain("ON CONFLICT (id) DO UPDATE");
    expect(query).toContain("WHERE job_drafts.client_address = $2");
    expect(values).toEqual([
      "draft-1",
      "GCLIENT",
      "Updated",
      "Description",
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      [],
      undefined,
    ]);
  });

  it("creates a draft when no id is supplied", async () => {
    const draft = { id: "new-draft", client_address: "GCLIENT" };
    mockQuery.mockResolvedValue({ rows: [draft] });

    await expect(saveDraft("GCLIENT", { title: "New role" })).resolves.toBe(draft);

    const [query, values] = mockQuery.mock.calls[0];
    expect(query).toContain("INSERT INTO job_drafts");
    expect(query).not.toContain("ON CONFLICT");
    expect(values[0]).toBe("GCLIENT");
    expect(values[1]).toBe("New role");
  });

  it("scopes draft listing and lookup to the owning client", async () => {
    const drafts = [{ id: "draft-1", client_address: "GCLIENT" }];
    mockQuery.mockResolvedValueOnce({ rows: drafts }).mockResolvedValueOnce({ rows: [] });

    await expect(getDrafts("GCLIENT", 3)).resolves.toEqual(drafts);
    await expect(getDraft("draft-1", "GOTHER")).resolves.toBeUndefined();

    expect(mockQuery.mock.calls[0][0]).toContain("WHERE client_address = $1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["GCLIENT", 3]);
    expect(mockQuery.mock.calls[1][0]).toContain("id = $1 AND client_address = $2");
    expect(mockQuery.mock.calls[1][1]).toEqual(["draft-1", "GOTHER"]);
  });

  it("deletes only the owner's draft and supports expiration cleanup", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await deleteDraft("draft-1", "GCLIENT");
    await deleteExpiredDrafts();

    expect(mockQuery.mock.calls[0][0]).toContain(
      "WHERE id = $1 AND client_address = $2",
    );
    expect(mockQuery.mock.calls[0][1]).toEqual(["draft-1", "GCLIENT"]);
    expect(mockQuery.mock.calls[1][0]).toContain("updated_at < NOW() - INTERVAL '30 days'");
  });
});
