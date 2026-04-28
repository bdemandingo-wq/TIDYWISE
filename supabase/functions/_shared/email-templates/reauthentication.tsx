/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import { BRAND, styles } from './_brand.ts'

interface ReauthenticationEmailProps {
  token: string
  siteName?: string
}

export const ReauthenticationEmail = ({
  token,
  siteName = 'TidyWise',
}: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.logoWrap}>
          <Img src={BRAND.logoUrl} alt={siteName} style={styles.logo} />
        </Section>
        <Section style={styles.card}>
          <Heading style={styles.h1}>Confirm reauthentication</Heading>
          <Text style={styles.text}>Use the code below to confirm your identity:</Text>
          <Section style={styles.codeBox}>
            <Text style={styles.code}>{token}</Text>
          </Section>
          <Text style={styles.hint}>
            This code will expire shortly. If you didn't request this, you can
            safely ignore this email.
          </Text>
        </Section>
        <Section style={styles.footer}>
          <Text style={styles.footerText}>— {siteName}</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
