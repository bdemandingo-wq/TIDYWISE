/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  token?: string
  confirmationUrl?: string
}

export const MagicLinkEmail = ({
  siteName,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} password reset code: {token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your password reset code</Heading>
        <Text style={text}>
          Enter this 6-digit code in {siteName} to reset your password:
        </Text>
        <Section style={codeBox}>
          <Text style={code}>{token}</Text>
        </Section>
        <Text style={text}>
          This code expires in 1 hour. If you didn't request a password reset,
          you can safely ignore this email.
        </Text>
        <Text style={footer}>— {siteName}</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '500px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const codeBox = {
  background: '#f5f5f5',
  borderRadius: '8px',
  padding: '16px 24px',
  margin: '20px 0',
  textAlign: 'center' as const,
}
const code = {
  fontSize: '36px',
  fontWeight: 700 as const,
  letterSpacing: '10px',
  color: '#000000',
  margin: 0,
  textAlign: 'center' as const,
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
