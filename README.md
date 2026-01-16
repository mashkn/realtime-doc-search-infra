# Real-Time Document Search Infrastructure

This repository contains a backend-first system that explores how document
content can be indexed and made searchable in near real-time using
event-driven pipelines.

The project focuses on:
- Event-driven data ingestion
- At-least-once message delivery and idempotent consumers
- Denormalization and preprocessing for search
- Search indexing correctness and consistency
- Feature-based ranking signals

This is an infrastructure-focused project. Any frontend or UI components are
intentionally minimal and exist only to exercise the system.

## High-Level Architecture

Clients write documents and comments via an API. Writes emit events that are
processed asynchronously by indexing workers. Derived data is stored in a
search index and feature store, which power search queries.

## Services

- **api** – Write API for documents and comments; produces domain events
- **indexer** – Consumes events, denormalizes content, updates search + features
- **search** – Query service for full-text search and ranking
- **feature-store** – Stores derived signals used for ranking
- **shared** – Shared event schemas and types

## Status

Early development. Currently includes a basic API health endpoint.