import { NextResponse } from "next/server";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "Import commit is not enabled until authenticated organization context and the production database migration are active."
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      error: "Persistence adapter is intentionally gated. Use the migration preview to validate data until organization-scoped authentication is connected."
    },
    { status: 409 }
  );
}
