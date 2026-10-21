param location string = 'westeurope'

resource kv 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: 'kv-shop-prod'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}
