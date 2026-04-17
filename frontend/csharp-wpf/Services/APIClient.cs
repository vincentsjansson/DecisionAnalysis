using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using DecisionAnalysis.Models;

namespace DecisionAnalysis.Services
{
    public class ApiClient
    {
        private readonly HttpClient _http;

        public ApiClient()
        {
            _http = new HttpClient
            {
                BaseAddress = new Uri("http://127.0.0.1:8000/")
            };
        }

        public async Task<BackwardResponseDto> RunBackwardAsync(BackwardRequestDto request)
        {
            // Serialisera med JsonProperty-attributen (snake_case)
            var json = JsonConvert.SerializeObject(request);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Skicka POST till /backward
            var response = await _http.PostAsync("backward", content);

            // Kasta fel om backend svarar med 4xx/5xx
            response.EnsureSuccessStatusCode();

            // Läs JSON-svaret
            var responseJson = await response.Content.ReadAsStringAsync();

            // Deserialisera tillbaka till C#-objekt
            return JsonConvert.DeserializeObject<BackwardResponseDto>(responseJson);
        }
    }
}
