# Real-Time Document Search Infrastructure

This repository contains a **backend-first, infrastructure-focused system** that explores how document content can be indexed and made searchable in near real-time using **event-driven pipelines**.

The goal of this project is to demonstrate *real production patterns* used in search and data platforms:

* Event-driven data ingestion (Outbox pattern)
* At-least-once delivery with idempotent consumers
* Denormalization and preprocessing for search
* Indexing correctness and consistency
* Clear separation between write paths and read paths

Any frontend or UI components are intentionally minimal (or absent) and exist only to exercise the system.

---

## High-Level Architecture

Clients write documents via an API. Writes are persisted as the source of truth and **emit durable domain events** in the same database transaction. These events are processed asynchronously by a background indexer, which builds a denormalized search index optimized for query performance.

```
Client
  |
  v
API (source of truth)
  |  \__ documents table
  |  \__ outbox_events table (durable event log)
  |
  v
Publisher (marks events published)
  |
  v
Indexer (consumer)
  |  \__ search_documents (denormalized index)
  |
  v
Search API (read-optimized queries)
```

This mirrors how real-world systems decouple **writes** from **reads** while maintaining correctness.

---

## Services

### `api/`

Write-facing API responsible for:

* Creating and fetching documents
* Writing durable domain events to `outbox_events`
* Publishing outbox events (manual trigger)
* Serving search queries from the denormalized index

### `indexer/`

Background worker that:

* Polls the outbox for published, unconsumed events
* Processes events exactly-once per consumer (idempotent)
* Denormalizes document data into the search index
* Tracks consumption via `indexed_at`

### `shared/`

Shared event schemas and contracts:

* Versioned event types (e.g. `document.upserted.v1`)
* Zod schemas for runtime validation
* TypeScript types for compile-time safety

### (Planned)

* `search/` – Dedicated read service for search queries
* `feature-store/` – Derived ranking signals and features

---

## Data Model

### Source of Truth

* `documents` – Canonical document storage

### Durable Event Log

* `outbox_events`

  * `published_at` → event has been published
  * `indexed_at` → event has been consumed by the indexer

### Denormalized Index

* `search_documents` – Read-optimized table used by search queries

---

## Current Status

✔ Core write API implemented
✔ Durable outbox events with transactional guarantees
✔ Publisher with concurrency-safe locking
✔ Background indexer service consuming events
✔ Denormalized search index populated asynchronously

Search querying is implemented next.

---

## Design Notes

* Uses `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent processing
* Follows strict separation of producer vs consumer responsibilities
* Event payloads are immutable; consumer state is tracked separately
* Event types are versioned to support schema evolution

This project is intentionally built incrementally to mirror how real systems evolve over time.
