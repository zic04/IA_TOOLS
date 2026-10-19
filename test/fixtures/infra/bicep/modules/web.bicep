param appName string
param location string

@secure()
param adminPassword string

resource plan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: '${appName}-plan'
  location: location
  sku: {
    name: 'P1v3'
  }
}

resource site 'Microsoft.Web/sites@2022-03-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      appSettings: [
        {
          name: 'ADMIN_PASSWORD'
          value: adminPassword
        }
        {
          name: 'FEATURE_FLAG'
          value: 'fixture-app-setting-not-kept'
        }
      ]
    }
  }
}

output url string = 'https://${site.properties.defaultHostName}'
