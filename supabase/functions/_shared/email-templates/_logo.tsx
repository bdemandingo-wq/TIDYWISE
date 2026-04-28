/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Img, Section, Text } from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './_brand.ts'

export const Logo = () => (
  <Section style={styles.logoWrap}>
    {BRAND.logoUrl ? (
      <Img src={BRAND.logoUrl} alt="TidyWise" style={styles.logo} />
    ) : (
      <Text style={styles.logoText}>TidyWise</Text>
    )}
  </Section>
)
