// Mock three/examples modules that use ESM import syntax not supported by Jest by default
jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: function() { return { load: jest.fn() }; }
}));
jest.mock('three/examples/jsm/controls/PointerLockControls.js', () => ({
  PointerLockControls: function() { return function() {}; }
}));

// jsdom doesn't implement canvas.getContext which three.js expects; stub it for tests
// This must be set before importing App so the renderer creation doesn't throw
HTMLCanvasElement.prototype.getContext = HTMLCanvasElement.prototype.getContext || function() { return {}; };

import { render, screen } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
