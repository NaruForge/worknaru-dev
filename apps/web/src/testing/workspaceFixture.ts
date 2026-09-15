import { createWorkspaceDomain, type Workspace, type Project } from '@worknaru/core';

export const sampleWorkspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '제품 개발',
  createdAt: '2026-09-15T01:00:00.000Z',
};
export const sampleProject: Project = {
  id: '22222222-2222-4222-8222-222222222222',
  workspaceId: sampleWorkspace.id,
  name: '가을 출시 준비',
  createdAt: '2026-09-15T02:00:00.000Z',
};
export function workspaceFixture(empty = false) {
  const workspaces = new Map<string, Workspace>(
    empty ? [] : [[sampleWorkspace.id, sampleWorkspace]],
  );
  const projects = new Map<string, Project>(empty ? [] : [[sampleProject.id, sampleProject]]);
  return createWorkspaceDomain({
    store: {
      insertWorkspace: (value) => {
        workspaces.set(value.id, value);
      },
      findWorkspace: (id) => workspaces.get(id) ?? null,
      listWorkspaces: () => [...workspaces.values()],
      insertProject: (value) => {
        projects.set(value.id, value);
      },
      findProject: (id) => projects.get(id) ?? null,
      listProjects: (workspaceId) =>
        [...projects.values()].filter((value) => value.workspaceId === workspaceId),
    },
  });
}
