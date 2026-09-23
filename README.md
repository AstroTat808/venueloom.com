# VenueLoom

VenueLoom Website — The Operating System for Independent Event Venues.

From inquiry to event day, weave every part of your venue into one system.

## Start here

The platform architecture is recorded **before the application foundation** in repository history. Read [the platform blueprint](docs/architecture/README.md), [data model](docs/architecture/data-model.md), and [delivery plan](docs/architecture/delivery-plan.md) before changing a business workflow.

The approved visual direction is the supplied VenueLoom brand sheet: ivory canvas, Fraunces headlines, Manrope body text, woven V, ink navigation, and blue/teal/gold accents. The website and dashboard share this design system.

## Repository principles

- One TypeScript repository, a modular application, and PostgreSQL as the source of truth.
- Organization-owned data, multiple venues, explicit memberships and scoped permissions.
- Financial history, booking constraints, tenant isolation, and auditability are database concerns as well as application concerns.
- Additive migrations are expected. Preventing fundamental ownership and workflow redesign is the goal; promising a database that never changes is not.
- External payment collection, signature delivery, messaging, and production access require configured provider integrations. Tracking a status never implies performing the external action.

See [architecture decisions](docs/architecture/adr/README.md) for the rationale and [implementation status](docs/implementation-status.md) for the distinction between implemented and planned capabilities.
