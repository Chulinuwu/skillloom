import type { AdapterContext, DoctorCheck, Scope, ScopedTargetName } from "../domain/types.js";

export interface ScopedHarnessAdapter {
  readonly kind: "scoped";
  readonly name: ScopedTargetName;
  resolveDestination(context: AdapterContext, scope: Scope, skillName: string): string;
  doctor(context: AdapterContext): Promise<DoctorCheck[]>;
}

export interface GenericDirectoryAdapter {
  readonly kind: "directory";
  readonly name: "generic";
  resolveRoot(context: AdapterContext, destinationRoot: string): string;
  resolveDestination(context: AdapterContext, destinationRoot: string, skillName: string): string;
  doctor(context: AdapterContext, destinationRoot: string): Promise<DoctorCheck[]>;
}

export type HarnessAdapter = ScopedHarnessAdapter | GenericDirectoryAdapter;
