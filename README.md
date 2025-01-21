# CodePeek

CodePeek is a web-based tool for rendering and sharing various types of content including diagrams, code, and visualizations.

Live demo: https://codepeek.jobsum.works/

## Features

- Support for multiple content types:
  - Mermaid diagrams
  - Markmap mind maps
  - SVG graphics
  - React components
  - HTML content
  - Code execution (Python, PHP, Node.js)

- Real-time collaboration
- Shareable URLs for each render
- View count tracking
- API access

## Installation

1. Clone the repository:

    git clone https://github.com/khadnhdev/CodePeek.git

2. Install dependencies:

    npm install

3. Set up the database:

    npm run setup-db

4. Start the server:

    npm start

The server will run on http://localhost:3000 by default.

## Environment Variables

- PORT: Server port (default: 3000)
- BASE_URL: Base URL for the application
- NODE_ENV: Environment mode (development/production)

## API Usage

Basic example of using the API:

    // Create a new render
    fetch('https://codepeek.jobsum.works/api/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Your content here'
      })
    })
    .then(response => response.json())
    .then(data => console.log(data));

For more API documentation, visit https://codepeek.jobsum.works/api endpoint.

## License

MIT

## Support

For issues and feature requests, please create an issue in the repository. 