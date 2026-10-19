// The shop on Azure: storage, network and the web application.
targetScope = 'resourceGroup'

@description('Where every resource goes.')
param location string = resourceGroup().location

@secure()
param adminPassword string

@allowed([
  'Standard_LRS'
  'Standard_GRS'
])
param skuName string = 'Standard_LRS'

param deployNsg bool = true
param storageName string = 'stshop${uniqueString(resourceGroup().id)}'

var tags = {
  app: 'shop'
  note: 'resource fake \'Microsoft.Fake/things@2020-01-01\' = { is no declaration'
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'stshopassets'
  location: location
  sku: {
    name: skuName
  }
  kind: 'StorageV2'
  tags: tags

  resource blobs 'blobServices' = {
    name: 'default'
  }
}

resource logs 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-04-01' existing = {
  name: 'vnet-shared'
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-04-01' = if (deployNsg) {
  name: 'nsg-web'
  location: location
  properties: {
    securityRules: [
      {
        name: 'https-in'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          destinationPortRange: '443'
        }
      }
    ]
  }
}

resource internalNsg 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {
  name: 'nsg-internal'
  location: location
  properties: {
    securityRules: [
      {
        name: 'ssh-from-vnet'
        properties: {
          direction: 'Inbound'
          access: 'Allow'
          sourceAddressPrefixes: [
            '10.0.0.0/8'
          ]
        }
      }
      {
        name: 'all-out'
        properties: {
          direction: 'Outbound'
          access: 'Allow'
          sourceAddressPrefix: '0.0.0.0/0'
        }
      }
    ]
  }
}

resource queues 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = [for i in range(0, 3): {
  name: 'stshopassets/default/orders-${i}'
}]

module web './modules/web.bicep' = {
  name: 'web-deployment'
  params: {
    appName: 'shop-web'
    location: location
    adminPassword: adminPassword
  }
}

module registryStorage 'br:acmeregistry.azurecr.io/bicep/modules/storage:v1.2.0' = {
  name: 'registry-storage'
}

/*
resource legacy 'Microsoft.Web/sites@2020-06-01' = {
  name: 'old-site'
}
*/

// module old './modules/old.bicep' = {}

var script = '''
resource notReal 'Microsoft.Fake/fakes@2021-01-01' = {
  name: 'in-a-multi-line-string'
}
'''

output storageId string = storage.id
output webUrl string = web.outputs.url
