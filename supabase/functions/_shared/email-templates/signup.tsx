/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import { BRAND, styles } from './_brand.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.logoWrap}>
          <Img src={BRAND.logoUrl} alt={siteName} style={styles.logo} />
        </Section>
        <Section style={styles.card}>
          <Heading style={styles.h1}>Confirm your email</Heading>
          <Text style={styles.text}>
            Thanks for signing up for{' '}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            ! Please confirm your email address (
            <Link href={`mailto:${recipient}`} style={styles.link}>
              {recipient}
            </Link>
            ) by clicking the button below:
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>
              Verify Email
            </Button>
          </Section>
          <Text style={styles.hint}>
            If you didn't create an account, you can safely ignore this email.
          </Text>
        </Section>
        <Section style={styles.footer}>
          <Text style={styles.footerText}>— {siteName}</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
