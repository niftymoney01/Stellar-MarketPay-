"use strict";

const mockQuery = jest.fn();

jest.mock("../db/pool", () => ({
  query: (...args) => mockQuery(...args),
}));

const {
  createJobTemplate,
  listJobTemplates,
  getJobTemplate,
  deleteJobTemplate,
} = require("./jobTemplateService");

describe("jobTemplateService", () => {
  beforeEach(() => mockQuery.mockReset());

  it("creates a template and serializes structured fields", async () => {
    const result = { id: "template-1", clientAddress: "GCLIENT" };
    mockQuery.mockResolvedValue({ rows: [result] });
    const milestones = [{ title: "Design", amount: "25" }];
    const screeningQuestions = [{ question: "How?", required: true }];

    await expect(createJobTemplate("GCLIENT", {
      name: "Standard",
      title: "Build a contract",
      skills: "Rust, Soroban",
      milestones,
      screeningQuestions,
    })).resolves.toBe(result);

    const [query, values] = mockQuery.mock.calls[0];
    expect(query).toContain("INSERT INTO job_templates");
    expect(values[0]).toBe("GCLIENT");
    expect(values[7]).toEqual(["Rust", "Soroban"]);
    expect(values[8]).toBe(JSON.stringify(screeningQuestions));
    expect(values[9]).toBe(JSON.stringify(milestones));
  });

  it("rejects missing owner or required template fields before writing", async () => {
    await expect(createJobTemplate(null, { name: "Valid", title: "Valid" }))
      .rejects.toMatchObject({ status: 401 });
    await expect(createJobTemplate("GCLIENT", { title: "Missing name" }))
      .rejects.toMatchObject({ status: 400 });
    await expect(createJobTemplate("GCLIENT", { name: "Missing title" }))
      .rejects.toMatchObject({ status: 400 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("lists templates only for the requesting client", async () => {
    const templates = [{ id: "template-1", clientAddress: "GCLIENT" }];
    mockQuery.mockResolvedValue({ rows: templates });

    await expect(listJobTemplates("GCLIENT")).resolves.toEqual(templates);
    expect(mockQuery.mock.calls[0][0]).toContain("WHERE client_address = $1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["GCLIENT"]);
  });

  it("returns only an owned template and hides another client's template", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await expect(getJobTemplate("GOTHER", "template-1"))
      .rejects.toMatchObject({ status: 404 });
    expect(mockQuery.mock.calls[0][0]).toContain(
      "WHERE id = $1 AND client_address = $2",
    );
    expect(mockQuery.mock.calls[0][1]).toEqual(["template-1", "GOTHER"]);
  });

  it("deletes only the owner's template and reports missing ownership", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });

    await expect(deleteJobTemplate("GCLIENT", "template-1"))
      .resolves.toEqual({ success: true });
    expect(mockQuery.mock.calls[0][0]).toContain(
      "DELETE FROM job_templates WHERE id = $1 AND client_address = $2",
    );
    expect(mockQuery.mock.calls[0][1]).toEqual(["template-1", "GCLIENT"]);
    await expect(deleteJobTemplate("GOTHER", "template-1"))
      .rejects.toMatchObject({ status: 404 });
  });
});
