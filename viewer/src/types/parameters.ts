export type ParameterCategory =
  | 'SOURCE CONFIGURATION'
  | 'FEED GAS CONDITIONS'
  | 'CHITOSAN CAPTURE UNIT'
  | 'SIMULATION CONFIGURATION'
  | 'PHYSICAL CONSTANTS'

export type ParameterSourceType = 'literature' | 'company-data' | 'assumption' | 'simulated'
export type ParameterStatus = 'active' | 'needs-verification' | 'prototype'
export type ParameterValue = string | number

export type ModelParameter = {
  id: string
  name: string
  value: ParameterValue
  unit: string
  category: ParameterCategory
  sourceType: ParameterSourceType
  sourceId: string
  sourceTitle?: string
  sourcePublisher?: string
  sourceYear?: number | null
  sourceUrl?: string
  sourceDetails?: string
  measurementPeriod?: string
  notes?: string
  updatedAt?: string
  editable: boolean
  status: ParameterStatus
}

export type DataSource = {
  sourceId: string
  title: string
  sourceType: ParameterSourceType
  publisher: string
  year: number | null
  reference: string
  url?: string
  verificationStatus?: 'verified' | 'needs-verification'
  notes: string
}
