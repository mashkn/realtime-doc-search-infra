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

