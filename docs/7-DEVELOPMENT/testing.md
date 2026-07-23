# Testing Guide

This document provides guidelines for writing tests in Construction OS. Testing is critical to maintaining code quality and preventing regressions.

## Testing Philosophy

### What to Test

Focus on testing the things that matter most:

- **Business Logic** - Core domain models and their operations
- **API Contracts** - HTTP endpoint behavior and error handling
- **Critical Workflows** - End-to-end flows that users depend on
- **Data Persistence** - Database operations and data integrity
- **Error Conditions** - How the system handles failures gracefully

### What NOT to Test

Don't waste time testing framework code:

- Framework functionality (FastAPI, React, etc.)
- Third-party library implementation
- Simple getters/setters without logic
- View/presentation layer rendering (unless it contains logic)

## Test Structure

We use **pytest** with async support for all Python tests:

```python
import pytest
from httpx import AsyncClient
from construction_os.domain.project import Project

@pytest.mark.asyncio
async def test_create_project():
    """Test project creation."""
    project = Project(name="Test Project", description="Test description")
    await project.save()

    assert project.id is not None
    assert project.name == "Test Project"
    assert project.created is not None

@pytest.mark.asyncio
async def test_api_create_project():
    """Test project creation via API."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/projects",
            json={"name": "Test Project", "description": "Test description"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Project"
```

## Test Categories

### 1. Unit Tests

Test individual functions and methods in isolation:

```python
@pytest.mark.asyncio
async def test_project_validation():
    """Test that project name validation works."""
    with pytest.raises(InvalidInputError):
        Project(name="", description="test")

@pytest.mark.asyncio
async def test_project_archive():
    """Test project archiving."""
    project = Project(name="Test", description="")
    project.archive()
    assert project.archived is True
```

**Location**: `tests/unit/`

### 2. Integration Tests

Test component interactions and database operations:

```python
@pytest.mark.asyncio
async def test_create_project_with_sources():
    """Test creating a project and adding sources."""
    project = await create_project(name="Research", description="")
    source = await add_source(project_id=project.id, url="https://example.com")

    retrieved = await get_project_with_sources(project.id)
    assert len(retrieved.sources) == 1
    assert retrieved.sources[0].id == source.id
```

**Location**: `tests/integration/`

### 3. API Tests

Test HTTP endpoints and error responses:

```python
@pytest.mark.asyncio
async def test_get_projects_endpoint():
    """Test GET /projects endpoint."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/projects")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

@pytest.mark.asyncio
async def test_create_project_validation():
    """Test that invalid input is rejected."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/projects",
            json={"name": "", "description": ""}
        )
        assert response.status_code == 400
```

**Location**: `tests/api/`

### 4. Database Tests

Test data persistence and query correctness:

```python
@pytest.mark.asyncio
async def test_save_and_retrieve_project():
    """Test saving and retrieving a project from database."""
    project = Project(name="Test", description="desc")
    await project.save()

    retrieved = await Project.get(project.id)
    assert retrieved.name == "Test"
    assert retrieved.description == "desc"

@pytest.mark.asyncio
async def test_query_by_criteria():
    """Test querying projects by criteria."""
    await create_project("Active", "")
    await create_project("Archived", "")

    active = await repo_query(
        "SELECT * FROM project WHERE archived = false"
    )
    assert len(active) >= 1
```

**Location**: `tests/database/`

## Running Tests

### Run All Tests

```bash
uv run pytest
```

### Run Specific Test File

```bash
uv run pytest tests/test_projects.py
```

### Run Specific Test Function

```bash
uv run pytest tests/test_projects.py::test_create_project
```

### Run with Coverage Report

```bash
uv run pytest --cov=construction_os
```

### Run Only Unit Tests

```bash
uv run pytest tests/unit/
```

### Run Only Integration Tests

```bash
uv run pytest tests/integration/
```

### Run Tests in Verbose Mode

```bash
uv run pytest -v
```

### Run Tests with Output

```bash
uv run pytest -s
```

## Test Fixtures

Use pytest fixtures for common setup and teardown:

```python
import pytest

@pytest.fixture
async def test_project():
    """Create a test project."""
    project = Project(name="Test Project", description="Test description")
    await project.save()
    yield project
    await project.delete()

@pytest.fixture
async def api_client():
    """Create an API test client."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
async def test_project_with_sources(test_project):
    """Create a test project with sample sources."""
    source1 = Source(project_id=test_project.id, url="https://example.com")
    source2 = Source(project_id=test_project.id, url="https://example.org")
    await source1.save()
    await source2.save()

    test_project.sources = [source1, source2]
    yield test_project

    # Cleanup
    await source1.delete()
    await source2.delete()
```

## Best Practices

### 1. Write Descriptive Test Names

```python
# Good - clearly describes what is being tested
async def test_create_project_with_valid_name_succeeds():
    ...

# Bad - vague about what's being tested
async def test_project():
    ...
```

### 2. Use Docstrings

```python
@pytest.mark.asyncio
async def test_vector_search_returns_sorted_results():
    """Test that vector search results are sorted by relevance score."""
    # Implementation
```

### 3. Test Edge Cases

```python
@pytest.mark.asyncio
async def test_search_with_empty_query():
    """Test that empty query raises error."""
    with pytest.raises(InvalidInputError):
        await vector_search("")

@pytest.mark.asyncio
async def test_search_with_very_long_query():
    """Test that very long query is handled."""
    long_query = "x" * 10000
    results = await vector_search(long_query)
    assert isinstance(results, list)

@pytest.mark.asyncio
async def test_search_with_special_characters():
    """Test that special characters are handled."""
    results = await vector_search("@#$%^&*()")
    assert isinstance(results, list)
```

### 4. Use Assertions Effectively

```python
# Good - specific assertions
assert project.name == "Test"
assert len(project.sources) == 3
assert project.created is not None

# Less good - too broad
assert project is not None
assert project  # ambiguous what's being tested
```

### 5. Test Both Success and Failure Cases

```python
@pytest.mark.asyncio
async def test_create_project_success():
    """Test successful project creation."""
    project = await create_project(name="Research", description="AI")
    assert project.id is not None
    assert project.name == "Research"

@pytest.mark.asyncio
async def test_create_project_empty_name_fails():
    """Test that empty name raises error."""
    with pytest.raises(InvalidInputError):
        await create_project(name="", description="")

@pytest.mark.asyncio
async def test_create_project_duplicate_fails():
    """Test that duplicate names are handled."""
    await create_project(name="Research", description="")
    with pytest.raises(DuplicateError):
        await create_project(name="Research", description="")
```

### 6. Keep Tests Independent

```python
# Good - test is self-contained
@pytest.mark.asyncio
async def test_archive_project():
    project = Project(name="Test", description="")
    await project.save()
    await project.archive()
    assert project.archived is True

# Bad - depends on another test's state
@pytest.mark.asyncio
async def test_archive_existing_project():
    # Assumes test_create_project ran first
    await project.archive()  # project undefined
```

### 7. Use Fixtures for Reusable Setup

```python
# Instead of repeating setup:
@pytest.fixture
async def client_with_auth(api_client, mock_auth):
    """Client with authentication set up."""
    api_client.headers.update({"Authorization": f"Bearer {mock_auth.token}"})
    yield api_client

@pytest.mark.asyncio
async def test_protected_endpoint(client_with_auth):
    """Test protected endpoint."""
    response = await client_with_auth.get("/api/protected")
    assert response.status_code == 200
```

## Coverage Goals

- Aim for 70%+ overall coverage
- 90%+ coverage for critical business logic
- Don't obsess over 100% - focus on meaningful tests
- Use `--cov` flag to check coverage: `uv run pytest --cov=construction_os`

## Async Test Patterns

### Testing Async Functions

```python
@pytest.mark.asyncio
async def test_async_operation():
    """Test async function."""
    result = await some_async_function()
    assert result is not None
```

### Testing Concurrent Operations

```python
@pytest.mark.asyncio
async def test_concurrent_project_creation():
    """Test creating multiple projects concurrently."""
    tasks = [
        create_project(f"Project {i}", "")
        for i in range(10)
    ]
    projects = await asyncio.gather(*tasks)
    assert len(projects) == 10
    assert all(n.id for n in projects)
```

## Retrieval eval (RAG quality gate)

CI always runs a **dry-run** of the retrieval eval dataset (no live DB):

```bash
CONSTRUCTION_OS_EVAL_DRY_RUN=1 python scripts/eval_retrieval.py
uv run pytest -q tests/test_eval_retrieval_dry_run.py
```

Dry-run requires fixture IDs (`project:retrieval_eval`, `source:eval_*`) and
checks that every expected ID exists in `tests/eval/graph_rag/corpus.json`.

For a full recall@k comparison (vector vs hybrid):

```bash
uv run python scripts/seed_retrieval_eval.py
uv run python scripts/eval_retrieval.py
```

See `scripts/README.md` → `eval_retrieval.py`.

---

## Common Testing Errors

### Error: "event loop is closed"

Solution: Use the async fixture properly:
```python
@pytest.fixture
async def project():  # Use async fixture
    project = Project(name="Test", description="")
    await project.save()
    yield project
    await project.delete()
```

### Error: "object is not awaitable"

Solution: Make sure you're using await:
```python
# Wrong
result = create_project("Test", "")

# Right
result = await create_project("Test", "")
```

---

**See also:**
- [Code Standards](code-standards.md) - Code formatting and style
- [Contributing Guide](contributing.md) - Overall contribution workflow
