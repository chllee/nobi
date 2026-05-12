import styled from 'styled-components'

export const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
`

export const Card = styled.div`
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
`

export const Title = styled.h1`
  margin: 0 0 24px;
  font-size: 22px;
  font-weight: 600;
`

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
`

export const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
`

export const Input = styled.input`
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }
`

export const SubmitButton = styled.button`
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 8px;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: #333;
  }
`

export const ErrorMsg = styled.p`
  margin: 0 0 16px;
  padding: 10px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
  font-size: 14px;
`

export const Footer = styled.p`
  margin: 20px 0 0;
  font-size: 14px;
  text-align: center;
  color: #6b7280;

  a {
    color: #1a1a1a;
    font-weight: 500;
  }
`
