// ts-morph over source read from git at a fixed revision (in-memory file system).
import { Project, type SourceFile } from "ts-morph";
import { Git } from "./git";

export const TS_FILE = /\.(ts|tsx|mts|cts)$/;

export function loadProject(repo: string, rev: string, paths: string[]): Project {
  const git = new Git(repo);
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { jsx: 4 /* ReactJSX */, allowJs: true },
  });
  for (const p of paths.filter((p) => TS_FILE.test(p))) {
    const text = git.show(rev, p);
    if (text !== null) project.createSourceFile(`/${p}`, text, { overwrite: true });
  }
  return project;
}

/** Repo-relative path of a source file in a project built by loadProject. */
export const repoPath = (sf: SourceFile) => sf.getFilePath().replace(/^\//, "");
