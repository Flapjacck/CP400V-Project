# CP400V Final Project

This file lays out what our GitHub repo needs to hold for the CP400V final project (Cloud Architecture Investigation, Design and Prototype). The written report lives in a shared Google Doc. Everything that runs, builds, or gets graded as code lives here.

**Due:** December 10, 11:59 p.m. Eastern. Late work loses 20% if it's under 24 hours late, and after that it isn't accepted. So we're aiming for Dec 8.

**Domain:** TBD. We pick this first, since almost everything below depends on it.

---

## What the repo is responsible for

The spec asks us to submit these, and they belong in the repo:

| Deliverable | Where it lives | Marks it feeds |
| --- | --- | --- |
| Prototype source code | `frontend/`, `backend/` | Working prototype (15) |
| Dockerfiles | One per service | Working prototype (15) |
| Docker Compose config | `docker-compose.yml` at the root | Working prototype (15) |
| README with setup and verification steps | `README.md` at the root | Working prototype, Demonstration |
| Architecture diagram (source and export) | `docs/diagram/` | Architecture design (12) |
| Link to the demo video | `README.md` | Demonstration (4) |

The report sections (investigation, design and decisions, security analysis, failure analysis) get written in the Google Doc. The repo only links to the final PDF.

---

## Folder layout

```
.
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
├── backend/
│   ├── Dockerfile
│   ├── src/
│   └── tests/
├── db/
│   └── init/            # schema and seed SQL, run on first start
├── docs/
│   ├── diagram/         # .drawio source plus a PNG/SVG export
│   ├── report.pdf       # final export from the Google Doc, added at the end
│   └── decisions.md     # short running log of choices we made and why
└── scripts/
    └── verify.sh        # quick checks the README points to
```

This is the minimum shape. If we add a cache or a second backend service, it gets its own folder and its own Dockerfile.

---

## The prototype

The spec's recommended minimum is three containers:

1. **Frontend or Nginx.** Serves the UI and acts as the entry point. In the proposed cloud design this stands in for the load balancer and the edge.
2. **Backend.** The API. It talks to the database over the internal Compose network and never gets published to the host directly.
3. **Database.** It uses a named volume so data survives `docker compose down` and `up`. That's the "persistent data" the spec wants us to show.

Anything other than this shape (stateless designs, say) needs the instructor's approval first, so we're sticking with it.

Optional extras, if we have time and they fit the domain:

- A Redis cache, which backs up the caching box in the diagram
- Running two backend replicas behind Nginx, which gives us something real to point at in the scaling and failure sections
- A health check on each service in Compose

### What we have to be able to show

- All services start with one command
- The frontend reaches the backend, and the backend reaches the database
- Data is still there after a restart
- Only the frontend port is exposed to the host

---

## Security controls we can actually put in the repo

The security analysis is 6 marks, and the spec wants us to be clear about which controls are real in the prototype and which are only proposed for the cloud version. These are the ones we can actually implement:

- **Secrets.** Credentials come from `.env`, which is gitignored. We commit `.env.example` with placeholder values only. No real passwords anywhere in the history, ever. The spec calls this out directly.
- **Ports.** Only Nginx publishes a port. The backend and DB stay on the internal network.
- **Container privileges.** Services run as a non-root user where the image allows it. No `privileged: true`.
- **Images.** Official base images with pinned versions (for example `postgres:16-alpine`, not `latest`). The spec doesn't need a scan report, but we should be able to say where each image comes from and how we'd keep it updated.
- **Network isolation.** Separate Compose networks for the frontend tier and the data tier if it's cheap to do.
- **Logging.** Services log to stdout so `docker compose logs` works for the demo.
- **Backups.** A small script or documented command to dump the database volume.

Things like MFA, IAM, WAF and managed backups get written up in the report as proposed controls. They don't need to exist in the repo.

---

## README checklist

The README is graded, and it's the first thing the TA opens. It should cover:

- [ ] What the app is and who it's for, in two or three sentences
- [ ] The architecture diagram, embedded as an image
- [ ] Prerequisites (Docker and Compose versions)
- [ ] Setup: clone, copy `.env.example` to `.env`, run `docker compose up --build`
- [ ] Verification steps, one per thing we claim works (service communication, persistence, port exposure)
- [ ] What the prototype does vs. what's only in the proposed cloud design
- [ ] Known limitations
- [ ] Link to the demo video
- [ ] Group members

---

## How we work in the repo

- `main` stays runnable. Nobody pushes straight to it once the skeleton is in.
- Work happens on short branches named after what they do, like `backend-auth` or `compose-healthchecks`, and gets merged through a PR with at least one other person looking at it.
- Every task is a GitHub Issue with an owner. A simple Project board (To do, In progress, Done) is enough.
- `docs/decisions.md` gets a line any time we make a real architecture call. That makes the "architectural justification and trade-offs" section (9 marks) much easier to write later, since the reasoning is already written down.

Suggested labels: `prototype`, `docs`, `security`, `diagram`, `blocked`.

---

## Rough timeline

| When | Goal |
| --- | --- |
| By Nov 21 | Domain picked, repo created, everyone added, skeleton Compose file running |
| By Nov 28 | All three services talking to each other, DB persistence working |
| By Dec 3 | Security controls in, diagram finished, README drafted |
| By Dec 6 | Demo video recorded off the working repo |
| By Dec 8 | Final pass, report PDF dropped into `docs/`, submission packaged |

Midterm II is Nov 26, so that week will be slow. Plan around it.

---

## Before we submit

- [ ] Fresh clone on a different machine runs with only the README steps
- [ ] No real credentials in the repo or its history
- [ ] `.env.example` is complete
- [ ] Diagram export matches what's actually in the report
- [ ] Demo video link works for someone outside the group
- [ ] Report PDF is in `docs/`
