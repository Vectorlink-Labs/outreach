# Backend

FastAPI service. Python 3.11+, PostgreSQL, no Docker.

What exists today: **the website connector.** Give it a product URL, it works
out whether the site has documentation, reads the right pages, turns them into
markdown and stores them in PostgreSQL. No AI anywhere in it.

---

## 1. Install PostgreSQL

Download the Windows installer from
<https://www.postgresql.org/download/windows/> and run it.

During setup:

- set a password for the `postgres` superuser and **write it down**
- leave the port as **5432**
- you do not need Stack Builder afterwards

### pgvector is not needed yet

Meaning-search needs the `pgvector` extension, and that is awkward to install on
Windows without Docker. Nothing in the current code uses it, so leave it. Deal
with it when the retrieval work starts.

## 2. Create the role and the database

Open **SQL Shell (psql)** from the Start menu, press Enter through the prompts,
and give the `postgres` password when asked. Then:

```sql
CREATE ROLE outreach WITH LOGIN PASSWORD 'outreach';
CREATE DATABASE outreach OWNER outreach;
```

Type `\q` to leave.

> Do this once. Never create tables by hand here — Alembic keeps its own record
> of what it has applied, and a hand-made table is invisible to it. The next
> migration then fails in a confusing way.

## 3. Set up Python

```bash
cd backend
py -m venv .venv
.venv\Scripts\python.exe -m pip install -e .
```

Copy the settings file and check the password matches what you used above:

```bash
copy .env.example .env
```

```
DATABASE_URL=postgresql+asyncpg://outreach:outreach@localhost:5432/outreach
```

## 4. Create the tables

```bash
.venv\Scripts\python.exe -m alembic upgrade head
```

Two tables appear: `product` and `product_page`.

## 5. Run it

```bash
.venv\Scripts\python.exe -m uvicorn outreach.main:app --reload
```

- API: <http://localhost:8000/api/v1>
- Interactive docs: <http://localhost:8000/docs>
- Readiness, which actually queries the database: <http://localhost:8000/api/v1/ready>

---

## Trying the crawler without a database

The fastest way to see whether it picked the right pages:

```bash
.venv\Scripts\python.exe ..\scripts\try_crawl.py https://coalent.ai
.venv\Scripts\python.exe ..\scripts\try_crawl.py https://coalent.ai --save out.md
.venv\Scripts\python.exe ..\scripts\try_crawl.py https://example.com --max-pages 10
```

It prints which mode discovery chose, which pages it read, how many words each
gave, and the first part of the combined markdown. No PostgreSQL involved.

## The endpoints

```
POST /api/v1/products                      { "name": "...", "url": "..." }
GET  /api/v1/products
GET  /api/v1/products/{id}                 status and the page list
GET  /api/v1/products/{id}/markdown        the combined document
POST /api/v1/products/{id}/recrawl         the only way a site is re-read
```

`POST /products` returns straight away with `state: "queued"` and reads the site
in the background. Poll `GET /products/{id}` until `state` becomes `ready`.

### The states

| state | meaning |
|---|---|
| `queued` | registered, crawl not started |
| `crawling` | in progress |
| `ready` | done, markdown stored |
| `thin` | fetched fine but every page was empty — a JavaScript-rendered site |
| `failed` | something broke, reason in `failure_reason` |

---

## How the crawl decides what to read

`connectors/website/discovery.py` looks for documentation in four places and
stops at the first real hit:

1. the usual paths — `/docs`, `/documentation`, `/guide`, `/reference` and friends
2. a docs subdomain — `docs.`, `help.`, `developers.`
3. `sitemap.xml`, looking for docs URLs inside it
4. the homepage's own links, for one whose text says "Docs"

A candidate only counts if the request succeeded, we were not redirected
somewhere unrelated, and there are at least 80 words on the page. Sites without
docs very often redirect `/docs` to the homepage, and that must not count.

**Documentation found → docs mode.** Only URLs under the docs root are crawled.
Nothing else on the site is touched.

**No documentation → site mode.** Pages are ranked by how likely they are to
explain the product:

```
first    /features /product /how-it-works /use-cases
         /solutions /platform /pricing /faq
then     the homepage, /about, /overview
never    /blog /news /careers /jobs /legal /privacy
         /terms /login /signup /contact /press
```

Blog posts and job adverts are excluded on purpose. They read like the product
without being about the product, and they are the biggest source of confusing
material.

## Manners

- `robots.txt` is read first and obeyed
- one page every half second, never in parallel against one host
- a real `User-Agent` naming us, with a contact URL
- 5xx and timeouts back off and retry three times; 4xx are not retried

## The seatbelts

Not targets. Stop lines, so one enormous documentation site cannot run for
hours. All in `.env`:

```
CRAWL_MAX_PAGES=500
CRAWL_MAX_SECONDS=900
CRAWL_MAX_BYTES=100000000
```

If one trips, `truncated` is set and `stop_reason` says which. The user is told
"we read 500 of about 5,000 pages" rather than being left to assume we read
everything.

---

## Two decisions written into this code

**No AI in the crawler.** Fetching, boilerplate removal and markdown
conversion, nothing else. That keeps it free to re-run, testable without a
model, and deterministic.

**Never re-read on a schedule.** A site is read once. The only way it is read
again is `POST /recrawl`, which only a person can trigger.

## One thing to change later

The crawl runs as a FastAPI background task, in the same process as the API.
That is right while there is no Redis. When Redis and Dramatiq arrive, move
`product_service.run_crawl` into an actor — the function is already written to
open its own database session, so nothing else has to change.
