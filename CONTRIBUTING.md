# Contributing to x402 MCP Server

We welcome contributions! This document explains how to get involved.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/x402-mcp-server.git
   cd x402-mcp-server
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
pnpm test        # Watch mode
pnpm test:ci     # CI mode with coverage
pnpm test:e2e    # E2E tests (requires live gateway)
```

### Building

```bash
pnpm build
```

### Code Style

- Use TypeScript strict mode
- Add `// ABOUTME:` comments to new files explaining purpose
- Follow existing patterns in the codebase

## Pull Request Process

1. Ensure all tests pass: `pnpm test:ci`
2. Update documentation if needed
3. Write clear commit messages
4. Open a PR against `main` branch
5. Fill out the PR template

### PR Requirements

- All tests must pass
- No decrease in code coverage
- Code must build without errors
- Include tests for new functionality

## Reporting Issues

Open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, OS)

## Code of Conduct

Be respectful and constructive. We're building tools to help AI agents participate in the economy.

## License

By contributing, you agree that your contributions will be licensed under Apache 2.0.

## Questions?

Open a discussion or reach out to the maintainers.
