import React from 'react';
import { Text, View } from 'react-native';

// Mock @expo/vector-icons BEFORE importing ErrorBoundary
jest.mock('@expo/vector-icons', () => {
  const { Text: MockText } = require('react-native');
  return {
    Ionicons: (props: any) => <MockText>{props.name}</MockText>,
  };
});

const { render, fireEvent } = require('@testing-library/react-native');
const ErrorBoundary = require('../components/ErrorBoundary').default;

// Suppress console.error for expected errors
const originalError = console.error;
beforeAll(() => { console.error = jest.fn(); });
afterAll(() => { console.error = originalError; });

// Component that throws on render
function ThrowingComponent(): React.ReactElement {
  throw new Error('Test error');
}

// Component that throws on button press
function CrashOnPress(): React.ReactElement {
  const [shouldThrow, setShouldThrow] = React.useState(false);
  if (shouldThrow) throw new Error('Pressed crash');
  return (
    <View>
      <Text>Normal content</Text>
      <Text testID="crash-btn" onPress={() => setShouldThrow(true)}>Crash</Text>
    </View>
  );
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Hello World</Text>
      </ErrorBoundary>
    );
    expect(getByText('Hello World')).toBeTruthy();
  });

  it('shows error UI when child throws', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText(/app encountered an unexpected error/)).toBeTruthy();
  });

  it('shows retry button', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(getByText('Try Again')).toBeTruthy();
  });

  it('shows error message from the thrown error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(getByText('Test error')).toBeTruthy();
  });

  it('catches errors from event handlers', () => {
    const { getByTestId } = render(
      <ErrorBoundary>
        <CrashOnPress />
      </ErrorBoundary>
    );
    // Event handler errors are caught by ErrorBoundary via setState
    fireEvent.press(getByTestId('crash-btn'));
  });
});
